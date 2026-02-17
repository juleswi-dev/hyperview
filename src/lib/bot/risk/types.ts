import type { RiskConfig } from "@/types/bot";
import type { OrderRequest, AccountState } from "@/types/exchange";

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface RiskChecker {
  validate(
    order: OrderRequest,
    account: AccountState,
    config: RiskConfig,
    dailyPnl: number,
    openOrderCount: number,
  ): RiskCheckResult;
}
