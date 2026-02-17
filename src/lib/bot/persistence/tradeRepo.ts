import { getDb } from "./db";
import type { TradeRecord, TradingMode, BotLogEntry, EquitySnapshot } from "@/types/bot";
import { v4 as uuidv4 } from "uuid";

// ── Trade CRUD ───────────────────────────────────────────────

export function insertTrade(trade: Omit<TradeRecord, "id">): TradeRecord {
  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO trades (id, bot_id, order_id, coin, side, size, price, fee, pnl, mode, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    trade.botId,
    trade.orderId ?? null,
    trade.coin,
    trade.side,
    trade.size,
    trade.price,
    trade.fee,
    trade.pnl,
    trade.mode,
    trade.timestamp,
  );

  return { ...trade, id };
}

export function getTradesByBot(
  botId: string,
  limit = 100,
  offset = 0,
): TradeRecord[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM trades WHERE bot_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
  ).all(botId, limit, offset) as Array<{
    id: string;
    bot_id: string;
    order_id: string | null;
    coin: string;
    side: string;
    size: number;
    price: number;
    fee: number;
    pnl: number;
    mode: string;
    timestamp: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    botId: r.bot_id,
    orderId: r.order_id ?? undefined,
    coin: r.coin,
    side: r.side as "buy" | "sell",
    size: r.size,
    price: r.price,
    fee: r.fee,
    pnl: r.pnl,
    mode: r.mode as TradingMode,
    timestamp: r.timestamp,
  }));
}

export function getTradeCount(botId: string): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM trades WHERE bot_id = ?").get(botId) as { count: number };
  return row.count;
}

// ── Bot Logs ─────────────────────────────────────────────────

export function insertLog(botId: string, level: "info" | "warn" | "error", message: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO bot_logs (bot_id, level, message, timestamp) VALUES (?, ?, ?, ?)",
  ).run(botId, level, message, Date.now());
}

export function getLogsByBot(
  botId: string,
  limit = 100,
  offset = 0,
): BotLogEntry[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM bot_logs WHERE bot_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
  ).all(botId, limit, offset) as Array<{
    id: number;
    bot_id: string;
    level: string;
    message: string;
    timestamp: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    botId: r.bot_id,
    level: r.level as "info" | "warn" | "error",
    message: r.message,
    timestamp: r.timestamp,
  }));
}

export function deleteOldLogs(botId: string, maxAgeDays = 7): number {
  const db = getDb();
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const result = db.prepare("DELETE FROM bot_logs WHERE bot_id = ? AND timestamp < ?").run(botId, cutoff);
  return result.changes;
}

// ── Equity Snapshots ─────────────────────────────────────────

export function insertEquitySnapshot(botId: string, equity: number): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO equity_snapshots (bot_id, equity, timestamp) VALUES (?, ?, ?)",
  ).run(botId, equity, Date.now());
}

export function getEquitySnapshots(
  botId: string,
  startTime?: number,
  limit = 1000,
): EquitySnapshot[] {
  const db = getDb();
  const where = startTime
    ? "WHERE bot_id = ? AND timestamp >= ?"
    : "WHERE bot_id = ?";
  const params = startTime ? [botId, startTime, limit] : [botId, limit];

  const rows = db.prepare(
    `SELECT * FROM equity_snapshots ${where} ORDER BY timestamp ASC LIMIT ?`,
  ).all(...params) as Array<{
    id: number;
    bot_id: string;
    equity: number;
    timestamp: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    botId: r.bot_id,
    equity: r.equity,
    timestamp: r.timestamp,
  }));
}
