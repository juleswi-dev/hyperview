import type { Strategy, StrategyContext } from "./types";
import type { FillEvent } from "@/types/exchange";
import type { LiquidationSniperConfig } from "@/types/bot";
import type { LiquidationSignal } from "@/lib/bot/feeds/LiquidationFeed";
import { strategyRegistry } from "./registry";

const MAX_PROCESSED_SIGNALS = 5_000;
const STALE_ORDER_TIMEOUT_MS = 120_000; // Cancel unfilled limit orders after 2 minutes

interface ActivePosition {
  coin: string;
  side: "buy" | "sell";
  entryPrice: number;
  size: number;
  orderId: string;
  enteredAt: number;
  filled: boolean;
  takeProfitOrderId?: string;
  stopLossOrderId?: string;
  signalHash: string;
  signalValue: number;
}

interface SniperState {
  activePositions: ActivePosition[];
  lastLiquidationTime: number;
  totalTrades: number;
  totalPnl: number;
  cooldownUntil: number;
  signalsDetected: number;
  signalsActedOn: number;
}

class LiquidationSniperStrategy implements Strategy {
  readonly id = "liquidation-sniper";
  readonly name = "Liquidation Sniper";
  readonly description = "Enter positions after large liquidation events";

  private config: LiquidationSniperConfig;
  private state: SniperState = {
    activePositions: [],
    lastLiquidationTime: 0,
    totalTrades: 0,
    totalPnl: 0,
    cooldownUntil: 0,
    signalsDetected: 0,
    signalsActedOn: 0,
  };
  private processedSignals = new Set<string>();

  constructor(config: LiquidationSniperConfig) {
    this.config = config;
  }

  async onInit(ctx: StrategyContext): Promise<void> {
    ctx.log("info", `Sniper initialized: watching ${this.config.coins.join(", ")}, min liq: $${this.config.minLiquidationValueUsd}`);
  }

  async onTick(ctx: StrategyContext): Promise<void> {
    const now = Date.now();

    // Manage existing positions
    for (const pos of [...this.state.activePositions]) {
      // Cancel stale unfilled limit orders
      if (!pos.filled && now - pos.enteredAt > STALE_ORDER_TIMEOUT_MS) {
        ctx.log("info", `Cancelling stale entry order for ${pos.coin} (unfilled after ${(STALE_ORDER_TIMEOUT_MS / 1000)}s)`);
        try {
          await ctx.cancelOrder({ coin: pos.coin, orderId: pos.orderId });
        } catch {
          // Order may have been filled in the meantime
        }
        this.state.activePositions = this.state.activePositions.filter((p) => p !== pos);
        continue;
      }

      // Only check TP/SL on filled positions
      if (!pos.filled) continue;

      const snapshot = ctx.getMarketSnapshot(pos.coin);
      if (!snapshot) continue;

      const pnlPercent = pos.side === "buy"
        ? ((snapshot.midPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - snapshot.midPrice) / pos.entryPrice) * 100;

      if (pnlPercent >= this.config.takeProfitPercent) {
        ctx.log("info", `TP hit for ${pos.coin}: ${pnlPercent.toFixed(2)}%`);
        await this.closePosition(ctx, pos);
      } else if (pnlPercent <= -this.config.stopLossPercent) {
        ctx.log("warn", `SL hit for ${pos.coin}: ${pnlPercent.toFixed(2)}%`);
        await this.closePosition(ctx, pos);
      }
    }

    // Check cooldown
    if (now < this.state.cooldownUntil) return;

    // Check max concurrent positions
    if (this.state.activePositions.length >= this.config.maxConcurrentPositions) return;

    // Query real liquidation signals from feed (last 10 seconds)
    const signal = this.checkEntrySignal(ctx);
    if (!signal) return;

    // Already have a position on this coin
    if (this.state.activePositions.some((p) => p.coin === signal.coin)) return;

    const snapshot = ctx.getMarketSnapshot(signal.coin);
    if (!snapshot) return;

    const account = ctx.getAccount();
    const positionSize = account.equity * (this.config.positionSizePercent / 100);
    if (positionSize < 10) return; // Minimum $10 position

    const size = positionSize / snapshot.midPrice;

    // Entry logic: snipe the bounce after a liquidation cascade
    // Long liquidation (forced sell) -> price dips -> buy
    // Short liquidation (forced buy) -> price spikes -> sell
    const entrySide: "buy" | "sell" = signal.side === "long" ? "buy" : "sell";

    // Confirmed signals: limit order with offset (dip may still be in progress)
    // Heuristic signals: market order (dip already happened, catch the bounce now)
    const useMarket = !signal.isConfirmed;
    const offsetMult = entrySide === "buy"
      ? (1 - this.config.entryOffsetPercent / 100)
      : (1 + this.config.entryOffsetPercent / 100);
    const entryPrice = useMarket ? snapshot.midPrice : snapshot.midPrice * offsetMult;

    // Push position BEFORE placeOrder so onFill can find it
    // (paper mode market orders fill synchronously inside placeOrder)
    const pendingPos: ActivePosition = {
      coin: signal.coin,
      side: entrySide,
      entryPrice,
      size,
      orderId: "", // Will be set after placeOrder
      enteredAt: now,
      filled: false,
      signalHash: signal.hash,
      signalValue: signal.value,
    };
    this.state.activePositions.push(pendingPos);

    try {
      const orderId = await ctx.placeOrder({
        coin: signal.coin,
        side: entrySide,
        size,
        price: entryPrice,
        orderType: useMarket ? "market" : "limit",
      });

      pendingPos.orderId = orderId;

      this.state.cooldownUntil = now + this.config.cooldownMs;
      this.state.signalsActedOn++;
      this.state.lastLiquidationTime = signal.time;

      ctx.log(
        "info",
        `Sniper entry: ${entrySide.toUpperCase()} ${signal.coin} ${size.toFixed(6)} @ $${pendingPos.entryPrice.toFixed(2)} ` +
        `[${useMarket ? "market" : "limit"}] (triggered by $${(signal.value / 1000).toFixed(0)}k ${signal.side} liq, ` +
        `${signal.isConfirmed ? "confirmed" : "heuristic"})`,
      );
    } catch (error) {
      // Remove the pending position on failure
      this.state.activePositions = this.state.activePositions.filter((p) => p !== pendingPos);
      ctx.log("warn", `Entry failed for ${signal.coin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onFill(ctx: StrategyContext, fill: FillEvent): Promise<void> {
    this.state.totalPnl += fill.closedPnl;

    // Check if this is an entry fill for one of our positions
    // Match by orderId first, then by coin+side for market fills (orderId may not be set yet)
    const pos = this.state.activePositions.find((p) =>
      !p.filled && (
        (p.orderId && p.orderId === fill.orderId) ||
        (!p.orderId && p.coin === fill.coin && p.side === fill.side)
      ),
    );
    if (pos) {
      pos.filled = true;
      pos.entryPrice = fill.price; // Update with actual fill price
      if (!pos.orderId) pos.orderId = fill.orderId;
      this.state.totalTrades++;
      ctx.log("info", `Sniper position filled: ${fill.coin} @ $${fill.price.toFixed(2)}`);
    }

    if (fill.closedPnl !== 0) {
      ctx.log("info", `Position closed: PnL $${fill.closedPnl.toFixed(2)}, total: $${this.state.totalPnl.toFixed(2)}`);
    }
  }

  async onStop(ctx: StrategyContext): Promise<void> {
    for (const coin of this.config.coins) {
      await ctx.cancelAllOrders(coin);
    }
    ctx.log("info", `Sniper stopped. Trades: ${this.state.totalTrades}, PnL: $${this.state.totalPnl.toFixed(2)}`);
  }

  getState(): Record<string, unknown> {
    return {
      ...this.state,
      activePositions: this.state.activePositions.map((p) => ({ ...p })),
    };
  }

  restoreState(state: Record<string, unknown>): void {
    this.state = {
      activePositions: ((state.activePositions as ActivePosition[]) ?? []).map((p) => ({
        ...p,
        filled: p.filled ?? true, // Assume filled for backwards compat with old state
      })),
      lastLiquidationTime: (state.lastLiquidationTime as number) ?? 0,
      totalTrades: (state.totalTrades as number) ?? 0,
      totalPnl: (state.totalPnl as number) ?? 0,
      cooldownUntil: (state.cooldownUntil as number) ?? 0,
      signalsDetected: (state.signalsDetected as number) ?? 0,
      signalsActedOn: (state.signalsActedOn as number) ?? 0,
    };
    // Re-populate processed signals from active positions
    for (const pos of this.state.activePositions) {
      this.processedSignals.add(pos.signalHash);
    }
  }

  private async closePosition(ctx: StrategyContext, pos: ActivePosition): Promise<void> {
    try {
      const closeSide = pos.side === "buy" ? "sell" : "buy";
      await ctx.placeOrder({
        coin: pos.coin,
        side: closeSide as "buy" | "sell",
        size: pos.size,
        orderType: "market",
        reduceOnly: true,
      });

      this.state.activePositions = this.state.activePositions.filter((p) => p !== pos);
    } catch (error) {
      ctx.log("error", `Failed to close ${pos.coin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private checkEntrySignal(ctx: StrategyContext): LiquidationSignal | null {
    // Cap processedSignals to prevent unbounded growth
    if (this.processedSignals.size > MAX_PROCESSED_SIGNALS) {
      // Keep only hashes from active positions
      const keep = new Set(this.state.activePositions.map((p) => p.signalHash));
      this.processedSignals = keep;
    }

    // Query liquidation feed for signals ingested in the last 30 seconds
    // (feed polls every 10s, so 30s gives enough window to catch new signals)
    for (const coin of this.config.coins) {
      const signals = ctx.getLiquidations(coin, 30_000);

      for (const signal of signals) {
        // Skip already-processed signals
        if (this.processedSignals.has(signal.hash)) continue;
        this.processedSignals.add(signal.hash);

        // Always count as detected (seen by this bot)
        this.state.signalsDetected++;

        // Filter by minimum value
        if (signal.value < this.config.minLiquidationValueUsd) continue;

        // Prefer confirmed signals, but accept heuristic if large enough
        if (!signal.isConfirmed && signal.value < this.config.minLiquidationValueUsd * 2) continue;

        return signal;
      }
    }

    return null;
  }
}

strategyRegistry.register({
  id: "liquidation-sniper",
  name: "Liquidation Sniper",
  description: "Enter positions after large liquidation events to catch post-liquidation bounces",
  defaultTickIntervalMs: 2_000,
  factory: (config) => new LiquidationSniperStrategy(config as unknown as LiquidationSniperConfig),
});
