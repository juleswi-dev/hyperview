import type { RiskConfig } from "@/types/bot";
import type { OrderRequest, AccountState } from "@/types/exchange";
import type { RiskCheckResult } from "./types";

export class RiskManager {
  constructor(private config: RiskConfig) {}

  validate(
    order: OrderRequest,
    account: AccountState,
    dailyPnl: number,
    openOrderCount: number,
    midPrice?: number,
  ): RiskCheckResult {
    // Check max open orders
    if (openOrderCount >= this.config.maxOpenOrders) {
      return { allowed: false, reason: `Max open orders reached (${this.config.maxOpenOrders})` };
    }

    // Check daily loss limit
    if (dailyPnl < 0 && Math.abs(dailyPnl) >= this.config.maxDailyLossUsd) {
      return { allowed: false, reason: `Daily loss limit reached ($${this.config.maxDailyLossUsd})` };
    }

    // Check position size - use midPrice for market orders that have no price
    const priceForCalc = order.price ?? midPrice ?? 0;
    if (priceForCalc === 0) {
      return { allowed: false, reason: "Cannot validate order: no price available" };
    }
    const orderValueUsd = order.size * priceForCalc;
    if (orderValueUsd > this.config.maxPositionSizeUsd) {
      return { allowed: false, reason: `Order size $${orderValueUsd.toFixed(0)} exceeds max $${this.config.maxPositionSizeUsd}` };
    }

    // Check margin usage
    const marginAfter = account.totalMarginUsed + orderValueUsd / this.config.maxLeverage;
    const marginPercent = account.equity > 0 ? (marginAfter / account.equity) * 100 : 100;
    if (marginPercent > this.config.maxMarginUsagePercent) {
      return { allowed: false, reason: `Margin usage ${marginPercent.toFixed(1)}% exceeds max ${this.config.maxMarginUsagePercent}%` };
    }

    // Check drawdown (requires peak equity from bot state)
    // This is checked at BotRunner level since it needs peak equity context

    return { allowed: true };
  }

  updateConfig(config: RiskConfig): void {
    this.config = config;
  }

  getConfig(): RiskConfig {
    return this.config;
  }
}
