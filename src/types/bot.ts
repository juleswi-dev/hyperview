// ── Trading Mode ──────────────────────────────────────────────
export type TradingMode = "paper" | "testnet" | "mainnet";

// ── Bot Status ───────────────────────────────────────────────
export type BotStatus = "idle" | "running" | "paused" | "stopped" | "error";

// ── Risk Configuration ──────────────────────────────────────
export interface RiskConfig {
  maxPositionSizeUsd: number;
  maxLeverage: number;
  maxMarginUsagePercent: number;
  maxDrawdownPercent: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  maxOpenOrders: number;
  maxDailyLossUsd: number;
}

// ── Bot Configuration (stored in DB) ────────────────────────
export interface BotConfig {
  id: string;
  name: string;
  strategyId: string;
  strategyConfig: Record<string, unknown>;
  coins: string[];
  mode: TradingMode;
  walletId?: string;
  riskConfig: RiskConfig;
  tickIntervalMs: number;
  status: BotStatus;
  strategyState?: Record<string, unknown>;
  startedAt?: number;
  stoppedAt?: number;
  lastTickAt?: number;
  lastError?: string;
  peakEquity: number;
  createdAt: number;
  updatedAt: number;
}

// ── Trade Record ─────────────────────────────────────────────
export interface TradeRecord {
  id: string;
  botId: string;
  orderId?: string;
  coin: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  fee: number;
  pnl: number;
  mode: TradingMode;
  timestamp: number;
}

// ── Bot Log Entry ────────────────────────────────────────────
export interface BotLogEntry {
  id: number;
  botId: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: number;
}

// ── Equity Snapshot ──────────────────────────────────────────
export interface EquitySnapshot {
  id: number;
  botId: string;
  equity: number;
  timestamp: number;
}

// ── Wallet ───────────────────────────────────────────────────
export type WalletMode = "private_key" | "vault";

export interface WalletConfig {
  id: string;
  label: string;
  mode: WalletMode;
  encryptedKey?: string;
  vaultAddress?: string;
  address: string;
  createdAt: number;
}

// ── API Request/Response types ───────────────────────────────
export interface CreateBotRequest {
  name: string;
  strategyId: string;
  strategyConfig: Record<string, unknown>;
  coins: string[];
  mode: TradingMode;
  walletId?: string;
  riskConfig: RiskConfig;
  tickIntervalMs?: number;
}

export interface UpdateBotRequest {
  name?: string;
  strategyConfig?: Record<string, unknown>;
  coins?: string[];
  riskConfig?: RiskConfig;
  tickIntervalMs?: number;
}

// ── Strategy Config Types ────────────────────────────────────
export interface DCAConfig {
  coin: string;
  amountUsd: number;
  intervalMs: number;
  dipBuyMultiplier?: number;
  maxTotalInvestmentUsd?: number;
}

export interface GridTradingConfig {
  coin: string;
  gridLevels: number;
  gridSpacingPercent: number;
  totalInvestmentUsd: number;
  upperPrice?: number;
  lowerPrice?: number;
}

export interface LiquidationSniperConfig {
  coins: string[];
  minLiquidationValueUsd: number;
  entryOffsetPercent: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  positionSizePercent: number;
  maxConcurrentPositions: number;
  cooldownMs: number;
}
