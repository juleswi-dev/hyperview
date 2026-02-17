import { getDb } from "./db";
import type { BotConfig, BotStatus, CreateBotRequest, UpdateBotRequest } from "@/types/bot";
import { v4 as uuidv4 } from "uuid";

interface BotRow {
  id: string;
  name: string;
  strategy_id: string;
  strategy_config: string;
  coins: string;
  mode: string;
  wallet_id: string | null;
  risk_config: string;
  tick_interval_ms: number;
  status: string;
  strategy_state: string | null;
  started_at: number | null;
  stopped_at: number | null;
  last_tick_at: number | null;
  last_error: string | null;
  peak_equity: number;
  created_at: number;
  updated_at: number;
}

function rowToBot(row: BotRow): BotConfig {
  return {
    id: row.id,
    name: row.name,
    strategyId: row.strategy_id,
    strategyConfig: JSON.parse(row.strategy_config),
    coins: JSON.parse(row.coins),
    mode: row.mode as BotConfig["mode"],
    walletId: row.wallet_id ?? undefined,
    riskConfig: JSON.parse(row.risk_config),
    tickIntervalMs: row.tick_interval_ms,
    status: row.status as BotStatus,
    strategyState: row.strategy_state ? JSON.parse(row.strategy_state) : undefined,
    startedAt: row.started_at ?? undefined,
    stoppedAt: row.stopped_at ?? undefined,
    lastTickAt: row.last_tick_at ?? undefined,
    lastError: row.last_error ?? undefined,
    peakEquity: row.peak_equity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listBots(): BotConfig[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM bots ORDER BY created_at DESC").all() as BotRow[];
  return rows.map(rowToBot);
}

export function getBot(id: string): BotConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM bots WHERE id = ?").get(id) as BotRow | undefined;
  return row ? rowToBot(row) : null;
}

export function createBot(req: CreateBotRequest): BotConfig {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO bots (id, name, strategy_id, strategy_config, coins, mode, wallet_id, risk_config, tick_interval_ms, status, peak_equity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', 0, ?, ?)
  `).run(
    id,
    req.name,
    req.strategyId,
    JSON.stringify(req.strategyConfig),
    JSON.stringify(req.coins),
    req.mode,
    req.walletId ?? null,
    JSON.stringify(req.riskConfig),
    req.tickIntervalMs ?? 10000,
    now,
    now,
  );

  return getBot(id)!;
}

export function updateBot(id: string, req: UpdateBotRequest): BotConfig | null {
  const db = getDb();
  const existing = getBot(id);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (req.name !== undefined) {
    updates.push("name = ?");
    values.push(req.name);
  }
  if (req.strategyConfig !== undefined) {
    updates.push("strategy_config = ?");
    values.push(JSON.stringify(req.strategyConfig));
  }
  if (req.coins !== undefined) {
    updates.push("coins = ?");
    values.push(JSON.stringify(req.coins));
  }
  if (req.riskConfig !== undefined) {
    updates.push("risk_config = ?");
    values.push(JSON.stringify(req.riskConfig));
  }
  if (req.tickIntervalMs !== undefined) {
    updates.push("tick_interval_ms = ?");
    values.push(req.tickIntervalMs);
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);

  db.prepare(`UPDATE bots SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getBot(id);
}

export function updateBotStatus(id: string, status: BotStatus, error?: string): void {
  const db = getDb();
  const now = Date.now();

  if (status === "running") {
    db.prepare("UPDATE bots SET status = ?, started_at = ?, last_error = NULL, updated_at = ? WHERE id = ?")
      .run(status, now, now, id);
  } else if (status === "stopped" || status === "error") {
    db.prepare("UPDATE bots SET status = ?, stopped_at = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .run(status, now, error ?? null, now, id);
  } else {
    db.prepare("UPDATE bots SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, id);
  }
}

export function updateBotStrategyState(id: string, state: Record<string, unknown>): void {
  const db = getDb();
  db.prepare("UPDATE bots SET strategy_state = ?, last_tick_at = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(state), Date.now(), Date.now(), id);
}

export function updateBotPeakEquity(id: string, equity: number): void {
  const db = getDb();
  db.prepare("UPDATE bots SET peak_equity = MAX(peak_equity, ?), updated_at = ? WHERE id = ?")
    .run(equity, Date.now(), id);
}

export function deleteBot(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM bots WHERE id = ?").run(id);
  return result.changes > 0;
}
