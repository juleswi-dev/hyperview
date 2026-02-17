import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = path.join(process.cwd(), "data", "hyperview.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      strategy_config TEXT NOT NULL,
      coins TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('paper', 'testnet', 'mainnet')),
      wallet_id TEXT,
      risk_config TEXT NOT NULL,
      tick_interval_ms INTEGER NOT NULL DEFAULT 10000,
      status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'stopped', 'error')),
      strategy_state TEXT,
      started_at INTEGER,
      stopped_at INTEGER,
      last_tick_at INTEGER,
      last_error TEXT,
      peak_equity REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      order_id TEXT,
      coin TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      size REAL NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      pnl REAL NOT NULL DEFAULT 0,
      mode TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('private_key', 'vault')),
      encrypted_key TEXT,
      vault_address TEXT,
      address TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      equity REAL NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trades_bot_id ON trades(bot_id);
    CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(bot_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_bot_logs_bot_id ON bot_logs(bot_id);
    CREATE INDEX IF NOT EXISTS idx_bot_logs_timestamp ON bot_logs(bot_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_equity_snapshots_bot_id ON equity_snapshots(bot_id, timestamp);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
