import type { TradingMode } from "./bot";

// ── Order Types ──────────────────────────────────────────────
export type OrderType = "limit" | "market";
export type OrderSide = "buy" | "sell";
export type TimeInForce = "GTC" | "IOC" | "ALO";

export interface OrderRequest {
  coin: string;
  side: OrderSide;
  size: number;
  price?: number;
  orderType: OrderType;
  reduceOnly?: boolean;
  timeInForce?: TimeInForce;
  cloid?: string;
}

export interface CancelRequest {
  coin: string;
  orderId: string;
}

// ── Fill Event (from exchange) ───────────────────────────────
export interface FillEvent {
  orderId: string;
  coin: string;
  side: OrderSide;
  size: number;
  price: number;
  fee: number;
  timestamp: number;
  closedPnl: number;
}

// ── Account State ────────────────────────────────────────────
export interface AccountPosition {
  coin: string;
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number | null;
  leverage: number;
  marginUsed: number;
}

export interface AccountState {
  equity: number;
  availableBalance: number;
  totalMarginUsed: number;
  positions: AccountPosition[];
}

// ── Market Snapshot ──────────────────────────────────────────
export interface MarketSnapshot {
  coin: string;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  markPrice: number;
  timestamp: number;
}

// ── Exchange Client Interface ────────────────────────────────
export interface ExchangeClient {
  readonly mode: TradingMode;
  placeOrder(order: OrderRequest): Promise<string>;
  cancelOrder(cancel: CancelRequest): Promise<void>;
  cancelAllOrders(coin?: string): Promise<void>;
  modifyOrder(orderId: string, newPrice: number, newSize: number): Promise<void>;
  setLeverage(asset: number, leverage: number, isCross: boolean): Promise<void>;
  getAccountState(): Promise<AccountState>;
  getRecentFills(startTime?: number): Promise<FillEvent[]>;
}
