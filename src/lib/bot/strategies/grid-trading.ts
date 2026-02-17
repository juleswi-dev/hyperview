import type { Strategy, StrategyContext } from "./types";
import type { FillEvent } from "@/types/exchange";
import type { GridTradingConfig } from "@/types/bot";
import { strategyRegistry } from "./registry";

interface GridLevel {
  price: number;
  side: "buy" | "sell";
  orderId?: string;
  filled: boolean;
}

interface GridState {
  levels: GridLevel[];
  initialized: boolean;
  centerPrice: number;
  totalFills: number;
  realizedPnl: number;
}

class GridTradingStrategy implements Strategy {
  readonly id = "grid";
  readonly name = "Grid Trading";
  readonly description = "Places buy/sell orders at regular price intervals";

  private config: GridTradingConfig;
  private needsOrderReplacement = false;
  private state: GridState = {
    levels: [],
    initialized: false,
    centerPrice: 0,
    totalFills: 0,
    realizedPnl: 0,
  };

  constructor(config: GridTradingConfig) {
    this.config = config;
  }

  async onInit(ctx: StrategyContext): Promise<void> {
    ctx.log("info", `Grid initialized: ${this.config.coin}, ${this.config.gridLevels} levels, ${this.config.gridSpacingPercent}% spacing`);
  }

  async onTick(ctx: StrategyContext): Promise<void> {
    const snapshot = ctx.getMarketSnapshot(this.config.coin);
    if (!snapshot) return;

    if (!this.state.initialized) {
      await this.initializeGrid(ctx, snapshot.midPrice);
      return;
    }

    // BUG 6: After restore, re-place orders for levels that have no orderId and aren't filled
    if (this.needsOrderReplacement) {
      await this.replaceRestoredOrders(ctx, snapshot.midPrice);
      this.needsOrderReplacement = false;
    }

    // Check and replace filled orders
    for (const level of this.state.levels) {
      if (level.filled && !level.orderId) {
        // Flip the side: if buy was filled, place sell at this level (and vice versa)
        const newSide: "buy" | "sell" = level.side === "buy" ? "sell" : "buy";
        const sizePerLevel = (this.config.totalInvestmentUsd / this.config.gridLevels) / level.price;

        try {
          const orderId = await ctx.placeOrder({
            coin: this.config.coin,
            side: newSide,
            size: sizePerLevel,
            price: level.price,
            orderType: "limit",
          });
          level.side = newSide;
          level.orderId = orderId;
          level.filled = false;
        } catch (error) {
          ctx.log("warn", `Failed to place grid order at $${level.price}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  async onFill(ctx: StrategyContext, fill: FillEvent): Promise<void> {
    this.state.totalFills++;
    this.state.realizedPnl += fill.closedPnl;

    // Mark the corresponding level as filled
    for (const level of this.state.levels) {
      if (level.orderId === fill.orderId) {
        level.filled = true;
        level.orderId = undefined;
        ctx.log("info", `Grid fill at $${fill.price.toFixed(2)} (${fill.side}), total fills: ${this.state.totalFills}`);
        break;
      }
    }
  }

  async onStop(ctx: StrategyContext): Promise<void> {
    await ctx.cancelAllOrders(this.config.coin);
    ctx.log("info", `Grid stopped. Total fills: ${this.state.totalFills}, realized PnL: $${this.state.realizedPnl.toFixed(2)}`);
  }

  getState(): Record<string, unknown> {
    return { ...this.state, levels: this.state.levels.map((l) => ({ ...l })) };
  }

  restoreState(state: Record<string, unknown>): void {
    if (state.levels && Array.isArray(state.levels)) {
      this.state = {
        levels: (state.levels as GridLevel[]).map((l) => ({
          ...l,
          orderId: undefined, // BUG 6: Clear stale order IDs from previous session
        })),
        initialized: (state.initialized as boolean) ?? false,
        centerPrice: (state.centerPrice as number) ?? 0,
        totalFills: (state.totalFills as number) ?? 0,
        realizedPnl: (state.realizedPnl as number) ?? 0,
      };
      // Mark that we need to re-place orders on first tick
      if (this.state.initialized) {
        this.needsOrderReplacement = true;
      }
    }
  }

  private async replaceRestoredOrders(ctx: StrategyContext, currentPrice: number): Promise<void> {
    ctx.log("info", "Re-placing grid orders after restore");
    for (const level of this.state.levels) {
      if (!level.filled && !level.orderId) {
        const sizePerLevel = (this.config.totalInvestmentUsd / this.config.gridLevels) / level.price;
        try {
          const orderId = await ctx.placeOrder({
            coin: this.config.coin,
            side: level.side,
            size: sizePerLevel,
            price: level.price,
            orderType: "limit",
          });
          level.orderId = orderId;
        } catch (error) {
          ctx.log("warn", `Failed to restore grid order at $${level.price.toFixed(2)}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  private async initializeGrid(ctx: StrategyContext, currentPrice: number): Promise<void> {
    this.state.centerPrice = currentPrice;
    const spacing = this.config.gridSpacingPercent / 100;
    const halfLevels = Math.floor(this.config.gridLevels / 2);
    const sizePerLevel = this.config.totalInvestmentUsd / this.config.gridLevels;

    const upper = this.config.upperPrice ?? currentPrice * (1 + spacing * halfLevels);
    const lower = this.config.lowerPrice ?? currentPrice * (1 - spacing * halfLevels);

    ctx.log("info", `Setting up grid: $${lower.toFixed(2)} - $${upper.toFixed(2)}`);

    const step = (upper - lower) / (this.config.gridLevels - 1);

    for (let i = 0; i < this.config.gridLevels; i++) {
      const price = lower + step * i;
      const side: "buy" | "sell" = price < currentPrice ? "buy" : "sell";
      const size = sizePerLevel / price;

      try {
        const orderId = await ctx.placeOrder({
          coin: this.config.coin,
          side,
          size,
          price,
          orderType: "limit",
        });

        this.state.levels.push({
          price,
          side,
          orderId,
          filled: false,
        });
      } catch (error) {
        ctx.log("warn", `Failed to place grid level at $${price.toFixed(2)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.state.initialized = true;
    ctx.log("info", `Grid initialized with ${this.state.levels.length} levels`);
  }
}

strategyRegistry.register({
  id: "grid",
  name: "Grid Trading",
  description: "Place buy/sell orders at regular price intervals to profit from range-bound markets",
  defaultTickIntervalMs: 10_000,
  factory: (config) => new GridTradingStrategy(config as unknown as GridTradingConfig),
});
