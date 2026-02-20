import type { OrderRequest, CancelRequest, AccountState, MarketSnapshot, FillEvent } from "@/types/exchange";
import type { LiquidationSignal } from "@/lib/bot/feeds/LiquidationFeed";

export interface StrategyContext {
  placeOrder(order: OrderRequest): Promise<string>;
  cancelOrder(cancel: CancelRequest): Promise<void>;
  cancelAllOrders(coin?: string): Promise<void>;
  getAccount(): AccountState;
  getMarketSnapshot(coin: string): MarketSnapshot | null;
  getLiquidations(coin?: string, sinceMs?: number): LiquidationSignal[];
  log(level: "info" | "warn" | "error", message: string): void;
}

export interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  onInit(ctx: StrategyContext): Promise<void>;
  onTick(ctx: StrategyContext): Promise<void>;
  onFill(ctx: StrategyContext, fill: FillEvent): Promise<void>;
  onStop(ctx: StrategyContext): Promise<void>;
  getState(): Record<string, unknown>;
  restoreState(state: Record<string, unknown>): void;
}

export type StrategyFactory = (config: Record<string, unknown>) => Strategy;

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  defaultTickIntervalMs: number;
  factory: StrategyFactory;
}
