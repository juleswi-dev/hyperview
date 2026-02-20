import type { BotConfig } from "@/types/bot";
import type {
  ExchangeClient,
  OrderRequest,
  CancelRequest,
  AccountState,
  MarketSnapshot,
  FillEvent,
} from "@/types/exchange";
import type { Strategy, StrategyContext } from "../strategies/types";
import { RiskManager } from "../risk/RiskManager";
import { OrderQueue } from "./OrderQueue";
import { PaperExchangeClient } from "../exchange/paper";
import { RealExchangeClient } from "../exchange/client";
import { strategyRegistry } from "../strategies/registry";
import { getDecryptedKey, getWallet } from "../wallet/WalletManager";
import type { Address, Hex } from "viem";
import {
  updateBotStatus,
  updateBotStrategyState,
  updateBotPeakEquity,
} from "../persistence/botRepo";
import { insertTrade, insertLog, insertEquitySnapshot } from "../persistence/tradeRepo";
import { getAllMids } from "@/lib/hyperliquid/api";
import { liquidationFeed } from "../feeds/LiquidationFeed";

// Minimum interval between price refreshes (ms)
const PRICE_CACHE_TTL = 5_000;
// Persist strategy state every N ticks instead of every tick
const STATE_PERSIST_INTERVAL = 6;

export class BotRunner {
  readonly botId: string;

  private config: BotConfig;
  private strategy: Strategy;
  private client: ExchangeClient;
  private riskManager: RiskManager;
  private orderQueue: OrderQueue;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private equityTimer: ReturnType<typeof setInterval> | null = null;
  private account: AccountState | null = null;
  private midPrices = new Map<string, number>();
  private dailyPnl = 0;
  private dailyPnlResetTime = 0;
  private running = false;
  private ticking = false; // BUG 3: guard against overlapping ticks
  private openOrderCount = 0;
  private lastPriceRefresh = 0;
  private tickCount = 0;

  constructor(config: BotConfig) {
    this.botId = config.id;
    this.config = config;

    // Create strategy from registry
    this.strategy = strategyRegistry.create(config.strategyId, config.strategyConfig);

    // Restore strategy state if available
    if (config.strategyState) {
      this.strategy.restoreState(config.strategyState);
    }

    // Create exchange client based on mode
    if (config.mode === "paper") {
      this.client = new PaperExchangeClient(
        10_000, // Default $10k starting equity
        (coin) => this.midPrices.get(coin) ?? null,
      );
    } else if (config.walletId) {
      const wallet = getWallet(config.walletId);
      if (!wallet) throw new Error("Wallet not found");
      const key = getDecryptedKey(config.walletId);
      this.client = new RealExchangeClient(
        config.mode as "mainnet" | "testnet",
        key,
        wallet.vaultAddress as Address | undefined,
      );
    } else {
      throw new Error("Wallet required for testnet/mainnet mode");
    }

    this.riskManager = new RiskManager(config.riskConfig);
    this.orderQueue = new OrderQueue(this.client);

    // BUG 9: Initialize daily PnL reset time to next midnight UTC
    this.dailyPnlResetTime = this.getNextMidnightUtc();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Register as liquidation feed consumer if sniper strategy
    if (this.config.strategyId === "liquidation-sniper") {
      liquidationFeed.addConsumer(this.botId);
    }

    this.log("info", `Bot starting (mode: ${this.config.mode}, strategy: ${this.config.strategyId})`);
    updateBotStatus(this.botId, "running");

    try {
      // Fetch initial prices
      await this.refreshPrices();

      // Get initial account state
      this.account = await this.client.getAccountState();

      // Initialize strategy
      await this.strategy.onInit(this.createContext());

      // Start tick loop
      this.tickTimer = setInterval(() => this.tick(), this.config.tickIntervalMs);

      // Snapshot equity every 5 minutes
      this.equityTimer = setInterval(() => this.snapshotEquity(), 300_000);

      this.log("info", "Bot started successfully");
    } catch (error) {
      this.log("error", `Failed to start: ${error instanceof Error ? error.message : String(error)}`);
      updateBotStatus(this.botId, "error", String(error));
      this.running = false;
      // Clean up feed consumer on failure
      if (this.config.strategyId === "liquidation-sniper") {
        liquidationFeed.removeConsumer(this.botId);
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.equityTimer) {
      clearInterval(this.equityTimer);
      this.equityTimer = null;
    }

    this.orderQueue.clear();

    try {
      await this.strategy.onStop(this.createContext());
      // Cancel all open orders on stop
      await this.client.cancelAllOrders();
    } catch (error) {
      this.log("warn", `Error during stop: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Unregister from liquidation feed if sniper
    if (this.config.strategyId === "liquidation-sniper") {
      liquidationFeed.removeConsumer(this.botId);
    }

    // Persist final state
    updateBotStrategyState(this.botId, this.strategy.getState());
    await this.snapshotEquity();
    updateBotStatus(this.botId, "stopped");
    this.log("info", "Bot stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    // BUG 3: Prevent overlapping async ticks
    if (this.ticking) return;
    this.ticking = true;

    try {
      // BUG 8: Only refresh prices if cache is stale
      const now = Date.now();
      if (now - this.lastPriceRefresh > PRICE_CACHE_TTL) {
        await this.refreshPrices();
        this.lastPriceRefresh = now;
      }

      // Update account state
      this.account = await this.client.getAccountState();

      // Check limit orders (paper mode)
      if (this.client instanceof PaperExchangeClient) {
        const limitFills = this.client.checkLimitOrders();
        for (const fill of limitFills) {
          await this.processFill(fill);
        }
      }

      // BUG 7: Check drawdown BEFORE running strategy, and only if still running
      if (this.running && this.account && this.config.peakEquity > 0) {
        const drawdown = ((this.config.peakEquity - this.account.equity) / this.config.peakEquity) * 100;
        if (drawdown >= this.config.riskConfig.maxDrawdownPercent) {
          this.log("error", `Max drawdown reached (${drawdown.toFixed(1)}%). Stopping bot.`);
          // Set error status FIRST, then stop (stop() will set "stopped" but we override after)
          this.running = false;
          if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
          if (this.equityTimer) { clearInterval(this.equityTimer); this.equityTimer = null; }
          this.orderQueue.clear();
          try {
            await this.strategy.onStop(this.createContext());
            await this.client.cancelAllOrders();
          } catch { /* best effort */ }
          // Clean up feed consumer on drawdown stop
          if (this.config.strategyId === "liquidation-sniper") {
            liquidationFeed.removeConsumer(this.botId);
          }
          updateBotStrategyState(this.botId, this.strategy.getState());
          updateBotStatus(this.botId, "error", "Max drawdown reached");
          return;
        }
      }

      // BUG 9: Reset daily PnL at midnight UTC
      if (now >= this.dailyPnlResetTime) {
        this.dailyPnl = 0;
        this.dailyPnlResetTime = this.getNextMidnightUtc();
      }

      // Run strategy tick
      await this.strategy.onTick(this.createContext());

      // BUG 12: Only persist strategy state every N ticks
      this.tickCount++;
      if (this.tickCount % STATE_PERSIST_INTERVAL === 0) {
        updateBotStrategyState(this.botId, this.strategy.getState());
      }

      // Update peak equity
      if (this.account && this.account.equity > this.config.peakEquity) {
        this.config.peakEquity = this.account.equity;
        updateBotPeakEquity(this.botId, this.account.equity);
      }
    } catch (error) {
      this.log("error", `Tick error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.ticking = false;
    }
  }

  private async processFill(fill: FillEvent): Promise<void> {
    // BUG 2: Decrement open order count on fill
    this.openOrderCount = Math.max(0, this.openOrderCount - 1);

    this.dailyPnl += fill.closedPnl;

    insertTrade({
      botId: this.botId,
      orderId: fill.orderId,
      coin: fill.coin,
      side: fill.side,
      size: fill.size,
      price: fill.price,
      fee: fill.fee,
      pnl: fill.closedPnl,
      mode: this.config.mode,
      timestamp: fill.timestamp,
    });

    try {
      await this.strategy.onFill(this.createContext(), fill);
    } catch (error) {
      this.log("warn", `Strategy onFill error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async refreshPrices(): Promise<void> {
    try {
      const mids = await getAllMids();
      for (const [coin, price] of Object.entries(mids)) {
        this.midPrices.set(coin, parseFloat(price));
      }
    } catch {
      // Use stale prices on failure
    }
  }

  private async snapshotEquity(): Promise<void> {
    if (!this.account) return;
    insertEquitySnapshot(this.botId, this.account.equity);
  }

  private getNextMidnightUtc(): number {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return tomorrow.getTime();
  }

  private createContext(): StrategyContext {
    return {
      placeOrder: async (order: OrderRequest): Promise<string> => {
        if (!this.account) throw new Error("Account not initialized");

        // BUG 1: Pass midPrice for market orders
        const midPrice = this.midPrices.get(order.coin);

        // Risk check
        const check = this.riskManager.validate(
          order,
          this.account!,
          this.dailyPnl,
          this.openOrderCount,
          midPrice,
        );
        if (!check.allowed) {
          this.log("warn", `Order rejected: ${check.reason}`);
          throw new Error(`Risk check failed: ${check.reason}`);
        }

        const orderId = await this.orderQueue.enqueue(order);
        this.openOrderCount++;

        // For paper market orders, process the fill immediately
        if (this.client instanceof PaperExchangeClient && order.orderType === "market") {
          const fills = await this.client.getRecentFills(Date.now() - 1000);
          for (const fill of fills) {
            if (fill.orderId === orderId) {
              await this.processFill(fill);
            }
          }
        }

        return orderId;
      },
      cancelOrder: async (cancel: CancelRequest): Promise<void> => {
        await this.client.cancelOrder(cancel);
        this.openOrderCount = Math.max(0, this.openOrderCount - 1);
      },
      cancelAllOrders: async (coin?: string): Promise<void> => {
        await this.client.cancelAllOrders(coin);
        this.openOrderCount = 0;
      },
      getAccount: (): AccountState => {
        if (!this.account) {
          return { equity: 0, availableBalance: 0, totalMarginUsed: 0, positions: [] };
        }
        return this.account;
      },
      getMarketSnapshot: (coin: string): MarketSnapshot | null => {
        const mid = this.midPrices.get(coin);
        if (!mid) return null;
        return {
          coin,
          midPrice: mid,
          bestBid: mid * 0.9999,
          bestAsk: mid * 1.0001,
          markPrice: mid,
          timestamp: Date.now(),
        };
      },
      getLiquidations: (coin?: string, sinceMs?: number) => {
        return liquidationFeed.getRecentLiquidations(coin, sinceMs);
      },
      log: (level, message) => this.log(level, message),
    };
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    insertLog(this.botId, level, message);
  }
}
