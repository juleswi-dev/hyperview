import type { Strategy, StrategyContext } from "./types";
import type { FillEvent } from "@/types/exchange";
import type { DCAConfig } from "@/types/bot";
import { strategyRegistry } from "./registry";

interface DCAState {
  lastBuyTime: number;
  totalInvested: number;
  totalSize: number;
  buyCount: number;
  avgEntryPrice: number;
  referencePriceAtLastBuy: number;
}

class DCAStrategy implements Strategy {
  readonly id = "dca";
  readonly name = "DCA (Dollar Cost Averaging)";
  readonly description = "Periodically buys a fixed USD amount at regular intervals";

  private config: DCAConfig;
  private state: DCAState = {
    lastBuyTime: 0,
    totalInvested: 0,
    totalSize: 0,
    buyCount: 0,
    avgEntryPrice: 0,
    referencePriceAtLastBuy: 0,
  };

  constructor(config: DCAConfig) {
    this.config = config;
  }

  async onInit(ctx: StrategyContext): Promise<void> {
    ctx.log("info", `DCA initialized: ${this.config.coin} $${this.config.amountUsd} every ${this.config.intervalMs / 1000}s`);
  }

  async onTick(ctx: StrategyContext): Promise<void> {
    const now = Date.now();

    // Check if it's time to buy
    if (now - this.state.lastBuyTime < this.config.intervalMs) {
      return;
    }

    // Check max investment limit
    if (
      this.config.maxTotalInvestmentUsd &&
      this.state.totalInvested >= this.config.maxTotalInvestmentUsd
    ) {
      ctx.log("info", "Max total investment reached, skipping buy");
      return;
    }

    const snapshot = ctx.getMarketSnapshot(this.config.coin);
    if (!snapshot) {
      ctx.log("warn", `No price for ${this.config.coin}, skipping tick`);
      return;
    }

    // Calculate buy amount with optional dip multiplier
    let amountUsd = this.config.amountUsd;
    if (
      this.config.dipBuyMultiplier &&
      this.state.referencePriceAtLastBuy > 0
    ) {
      const priceChange = (snapshot.midPrice - this.state.referencePriceAtLastBuy) / this.state.referencePriceAtLastBuy;
      // If price dropped more than 5%, increase buy amount
      if (priceChange < -0.05) {
        const multiplier = Math.min(this.config.dipBuyMultiplier, 1 + Math.abs(priceChange) * 5);
        amountUsd *= multiplier;
        ctx.log("info", `Dip detected (${(priceChange * 100).toFixed(1)}%), multiplier: ${multiplier.toFixed(2)}x`);
      }
    }

    // Respect max investment
    if (this.config.maxTotalInvestmentUsd) {
      const remaining = this.config.maxTotalInvestmentUsd - this.state.totalInvested;
      amountUsd = Math.min(amountUsd, remaining);
    }

    const size = amountUsd / snapshot.midPrice;

    try {
      await ctx.placeOrder({
        coin: this.config.coin,
        side: "buy",
        size,
        orderType: "market",
      });

      this.state.lastBuyTime = now;
      this.state.referencePriceAtLastBuy = snapshot.midPrice;
      ctx.log("info", `DCA buy: ${size.toFixed(6)} ${this.config.coin} @ ~$${snapshot.midPrice.toFixed(2)} ($${amountUsd.toFixed(2)})`);
    } catch (error) {
      ctx.log("error", `DCA buy failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onFill(ctx: StrategyContext, fill: FillEvent): Promise<void> {
    if (fill.side === "buy") {
      const prevTotal = this.state.totalSize * this.state.avgEntryPrice;
      this.state.totalSize += fill.size;
      this.state.totalInvested += fill.size * fill.price;
      this.state.avgEntryPrice = (prevTotal + fill.size * fill.price) / this.state.totalSize;
      this.state.buyCount++;

      ctx.log(
        "info",
        `Fill #${this.state.buyCount}: ${fill.size.toFixed(6)} @ $${fill.price.toFixed(2)}, total invested: $${this.state.totalInvested.toFixed(2)}, avg entry: $${this.state.avgEntryPrice.toFixed(2)}`,
      );
    }
  }

  async onStop(ctx: StrategyContext): Promise<void> {
    ctx.log("info", `DCA stopped. Total buys: ${this.state.buyCount}, invested: $${this.state.totalInvested.toFixed(2)}`);
  }

  getState(): Record<string, unknown> {
    return { ...this.state };
  }

  restoreState(state: Record<string, unknown>): void {
    this.state = {
      lastBuyTime: (state.lastBuyTime as number) ?? 0,
      totalInvested: (state.totalInvested as number) ?? 0,
      totalSize: (state.totalSize as number) ?? 0,
      buyCount: (state.buyCount as number) ?? 0,
      avgEntryPrice: (state.avgEntryPrice as number) ?? 0,
      referencePriceAtLastBuy: (state.referencePriceAtLastBuy as number) ?? 0,
    };
  }
}

// Register the strategy
strategyRegistry.register({
  id: "dca",
  name: "DCA (Dollar Cost Averaging)",
  description: "Periodically buys a fixed USD amount at regular intervals with optional dip buying",
  defaultTickIntervalMs: 60_000,
  factory: (config) => new DCAStrategy(config as unknown as DCAConfig),
});
