import type { Strategy, StrategyContext } from "./types";
import type { FillEvent } from "@/types/exchange";
import type { LiquidationSniperConfig } from "@/types/bot";
import { strategyRegistry } from "./registry";

interface ActivePosition {
  coin: string;
  side: "buy" | "sell";
  entryPrice: number;
  size: number;
  orderId: string;
  enteredAt: number;
  takeProfitOrderId?: string;
  stopLossOrderId?: string;
}

interface SniperState {
  activePositions: ActivePosition[];
  lastLiquidationTime: number;
  totalTrades: number;
  totalPnl: number;
  cooldownUntil: number;
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
  };

  constructor(config: LiquidationSniperConfig) {
    this.config = config;
  }

  async onInit(ctx: StrategyContext): Promise<void> {
    ctx.log("info", `Sniper initialized: watching ${this.config.coins.join(", ")}, min liq: $${this.config.minLiquidationValueUsd}`);
  }

  async onTick(ctx: StrategyContext): Promise<void> {
    const now = Date.now();

    // Check cooldown
    if (now < this.state.cooldownUntil) return;

    // Check max concurrent positions
    if (this.state.activePositions.length >= this.config.maxConcurrentPositions) return;

    // Check for take-profit and stop-loss on active positions
    for (const pos of [...this.state.activePositions]) {
      const snapshot = ctx.getMarketSnapshot(pos.coin);
      if (!snapshot) continue;

      const pnlPercent = pos.side === "buy"
        ? ((snapshot.midPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - snapshot.midPrice) / pos.entryPrice) * 100;

      if (pnlPercent >= this.config.takeProfitPercent) {
        // Take profit
        ctx.log("info", `TP hit for ${pos.coin}: ${pnlPercent.toFixed(2)}%`);
        await this.closePosition(ctx, pos);
      } else if (pnlPercent <= -this.config.stopLossPercent) {
        // Stop loss
        ctx.log("warn", `SL hit for ${pos.coin}: ${pnlPercent.toFixed(2)}%`);
        await this.closePosition(ctx, pos);
      }
    }

    // Monitor the existing account positions for any that show
    // characteristics of post-liquidation bounces. In paper mode,
    // we simulate by checking if price moved significantly recently.
    for (const coin of this.config.coins) {
      if (this.state.activePositions.some((p) => p.coin === coin)) continue;

      const snapshot = ctx.getMarketSnapshot(coin);
      if (!snapshot) continue;

      // Simple heuristic: check if we should enter based on market conditions.
      // In a real implementation, this would check the liquidation feed.
      // For now, we use a simplified approach that enters periodically
      // when conditions look favorable.
      const account = ctx.getAccount();
      const positionSize = (account.equity * (this.config.positionSizePercent / 100));

      if (positionSize < 10) continue; // Minimum $10 position

      // Simulate liquidation detection by checking price volatility
      // The real implementation would hook into useLiquidationStore
      const shouldEnter = this.checkEntrySignal(ctx, coin, snapshot.midPrice);
      if (!shouldEnter) continue;

      const size = positionSize / snapshot.midPrice;
      const entryPrice = snapshot.midPrice * (1 - this.config.entryOffsetPercent / 100);

      try {
        // Enter long after a liquidation cascade (prices are depressed)
        const orderId = await ctx.placeOrder({
          coin,
          side: "buy",
          size,
          price: entryPrice,
          orderType: "limit",
        });

        this.state.activePositions.push({
          coin,
          side: "buy",
          entryPrice,
          size,
          orderId,
          enteredAt: now,
        });

        this.state.cooldownUntil = now + this.config.cooldownMs;
        ctx.log("info", `Sniper entry: ${coin} ${size.toFixed(6)} @ $${entryPrice.toFixed(2)} (limit)`);
      } catch (error) {
        ctx.log("warn", `Entry failed for ${coin}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async onFill(ctx: StrategyContext, fill: FillEvent): Promise<void> {
    this.state.totalTrades++;
    this.state.totalPnl += fill.closedPnl;

    // Check if this fill is for one of our active entries
    const pos = this.state.activePositions.find((p) => p.orderId === fill.orderId);
    if (pos) {
      pos.entryPrice = fill.price; // Update with actual fill price
      ctx.log("info", `Sniper position filled: ${fill.coin} @ $${fill.price.toFixed(2)}`);
    }

    // Check if this is a closing fill
    if (fill.closedPnl !== 0) {
      ctx.log("info", `Position closed: PnL $${fill.closedPnl.toFixed(2)}, total: $${this.state.totalPnl.toFixed(2)}`);
    }
  }

  async onStop(ctx: StrategyContext): Promise<void> {
    // Cancel all pending orders
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
      activePositions: ((state.activePositions as ActivePosition[]) ?? []).map((p) => ({ ...p })),
      lastLiquidationTime: (state.lastLiquidationTime as number) ?? 0,
      totalTrades: (state.totalTrades as number) ?? 0,
      totalPnl: (state.totalPnl as number) ?? 0,
      cooldownUntil: (state.cooldownUntil as number) ?? 0,
    };
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

  private checkEntrySignal(_ctx: StrategyContext, _coin: string, _price: number): boolean {
    // Simplified: enter based on a time-based cadence to test in paper mode.
    // Real implementation would check liquidation events from the store.
    // For now, return false to avoid random entries - the strategy needs
    // the liquidation feed integration (Phase 8 polish).
    return false;
  }
}

strategyRegistry.register({
  id: "liquidation-sniper",
  name: "Liquidation Sniper",
  description: "Enter positions after large liquidation events to catch post-liquidation bounces",
  defaultTickIntervalMs: 2_000,
  factory: (config) => new LiquidationSniperStrategy(config as unknown as LiquidationSniperConfig),
});
