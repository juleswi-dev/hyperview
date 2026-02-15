// Asset Metadata
export interface AssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

// Market Context
export interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx?: string;
}

// Combined Asset Data
export interface Asset {
  meta: AssetMeta;
  ctx: AssetCtx;
  index: number;
}

// Order Book Level
export interface BookLevel {
  px: string;
  sz: string;
  n: number;
}

export interface L2Book {
  coin: string;
  levels: [BookLevel[], BookLevel[]]; // [bids, asks]
  time: number;
}

// Trade
export interface Trade {
  coin: string;
  side: "A" | "B";
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
}

// Fill with optional liquidation
export interface FillLiquidation {
  liquidatedUser: string;
  markPx: string;
  method: "market" | "backstop";
}

export interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B";
  time: number;
  hash: string;
  oid: number;
  tid: number;
  fee: string;
  dir: string;
  closedPnl: string;
  liquidation?: FillLiquidation;
  liquidationMarkPx?: string;
}

// Processed Liquidation for UI
export interface Liquidation {
  coin: string;
  size: number;
  price: number;
  value: number;
  side: "long" | "short";
  method: "market" | "backstop";
  time: number;
  hash: string;
  liquidatedUser?: string;
}

// Candle
export interface Candle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

// User Position
export interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  liquidationPx: string | null;
  leverage: {
    type: "cross" | "isolated";
    value: number;
  };
  marginUsed: string;
}

// Clearinghouse State
export interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  assetPositions: Array<{
    position: Position;
    type: "oneWay";
  }>;
  withdrawable: string;
}

// Funding Rate
export interface FundingRate {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

// WebSocket Message Types
export interface WsMessage {
  channel: string;
  data: unknown;
}

export interface WsSubscription {
  type: string;
  coin?: string;
  user?: string;
  interval?: string;
}
