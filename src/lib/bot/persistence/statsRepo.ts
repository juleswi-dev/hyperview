import { getDb } from "./db";

export interface BotStats {
  botId: string;
  botName: string;
  strategyId: string;
  mode: string;
  status: string;
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  peakEquity: number;
}

export interface AggregateStats {
  totalBots: number;
  runningBots: number;
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  overallWinRate: number;
  bestBot: { name: string; pnl: number } | null;
  worstBot: { name: string; pnl: number } | null;
}

export function getBotStats(botId: string): BotStats | null {
  const db = getDb();

  const bot = db.prepare("SELECT id, name, strategy_id, mode, status, peak_equity FROM bots WHERE id = ?")
    .get(botId) as { id: string; name: string; strategy_id: string; mode: string; status: string; peak_equity: number } | undefined;

  if (!bot) return null;

  const trades = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(pnl), 0) as totalPnl,
      COALESCE(SUM(fee), 0) as totalFees,
      COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0) as wins,
      COALESCE(SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END), 0) as losses,
      COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) as avgWin,
      COALESCE(AVG(CASE WHEN pnl < 0 THEN pnl END), 0) as avgLoss,
      COALESCE(MAX(pnl), 0) as largestWin,
      COALESCE(MIN(pnl), 0) as largestLoss
    FROM trades WHERE bot_id = ?
  `).get(botId) as {
    total: number; totalPnl: number; totalFees: number;
    wins: number; losses: number; avgWin: number; avgLoss: number;
    largestWin: number; largestLoss: number;
  };

  // Calculate Sharpe Ratio from trade returns (only closing trades with non-zero PnL)
  const pnls = db.prepare("SELECT pnl FROM trades WHERE bot_id = ? AND pnl != 0")
    .all(botId) as Array<{ pnl: number }>;

  let sharpeRatio = 0;
  if (pnls.length > 1) {
    const mean = pnls.reduce((s, p) => s + p.pnl, 0) / pnls.length;
    const variance = pnls.reduce((s, p) => s + (p.pnl - mean) ** 2, 0) / (pnls.length - 1);
    const stdDev = Math.sqrt(variance);
    // Annualize based on actual trade frequency, not assuming daily
    // Use trades per day estimate from timestamps
    const timestamps = db.prepare("SELECT MIN(timestamp) as first, MAX(timestamp) as last FROM trades WHERE bot_id = ? AND pnl != 0")
      .get(botId) as { first: number | null; last: number | null };
    let annualizationFactor = Math.sqrt(252); // fallback
    if (timestamps.first && timestamps.last && timestamps.last > timestamps.first) {
      const daysElapsed = (timestamps.last - timestamps.first) / 86_400_000;
      const tradesPerDay = daysElapsed > 0 ? pnls.length / daysElapsed : pnls.length;
      annualizationFactor = Math.sqrt(tradesPerDay * 252);
    }
    sharpeRatio = stdDev > 0 ? (mean / stdDev) * annualizationFactor : 0;
  }

  // Calculate max drawdown from equity snapshots
  const snapshots = db.prepare(
    "SELECT equity FROM equity_snapshots WHERE bot_id = ? ORDER BY timestamp ASC",
  ).all(botId) as Array<{ equity: number }>;

  let maxDrawdown = 0;
  let peak = 0;
  for (const snap of snapshots) {
    if (snap.equity > peak) peak = snap.equity;
    const drawdown = peak > 0 ? ((peak - snap.equity) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // BUG 15: Win rate should only count trades that actually closed positions (pnl != 0)
  const closingTrades = trades.wins + trades.losses;
  const winRate = closingTrades > 0 ? (trades.wins / closingTrades) * 100 : 0;

  return {
    botId: bot.id,
    botName: bot.name,
    strategyId: bot.strategy_id,
    mode: bot.mode,
    status: bot.status,
    totalTrades: trades.total,
    totalPnl: trades.totalPnl,
    totalFees: trades.totalFees,
    winningTrades: trades.wins,
    losingTrades: trades.losses,
    winRate,
    avgWin: trades.avgWin,
    avgLoss: trades.avgLoss,
    largestWin: trades.largestWin,
    largestLoss: trades.largestLoss,
    sharpeRatio,
    maxDrawdown,
    peakEquity: bot.peak_equity,
  };
}

export function getAggregateStats(): AggregateStats {
  const db = getDb();

  const botCounts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
    FROM bots
  `).get() as { total: number; running: number };

  const tradeTotals = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(pnl), 0) as totalPnl,
      COALESCE(SUM(fee), 0) as totalFees,
      COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0) as wins
    FROM trades
  `).get() as { total: number; totalPnl: number; totalFees: number; wins: number };

  // Best and worst bots by PnL
  const bestBot = db.prepare(`
    SELECT b.name, COALESCE(SUM(t.pnl), 0) as pnl
    FROM bots b LEFT JOIN trades t ON b.id = t.bot_id
    GROUP BY b.id ORDER BY pnl DESC LIMIT 1
  `).get() as { name: string; pnl: number } | undefined;

  const worstBot = db.prepare(`
    SELECT b.name, COALESCE(SUM(t.pnl), 0) as pnl
    FROM bots b LEFT JOIN trades t ON b.id = t.bot_id
    GROUP BY b.id ORDER BY pnl ASC LIMIT 1
  `).get() as { name: string; pnl: number } | undefined;

  return {
    totalBots: botCounts.total,
    runningBots: botCounts.running,
    totalTrades: tradeTotals.total,
    totalPnl: tradeTotals.totalPnl,
    totalFees: tradeTotals.totalFees,
    overallWinRate: tradeTotals.total > 0 ? (tradeTotals.wins / tradeTotals.total) * 100 : 0,
    bestBot: bestBot ? { name: bestBot.name, pnl: bestBot.pnl } : null,
    worstBot: worstBot && worstBot.pnl < 0 ? { name: worstBot.name, pnl: worstBot.pnl } : null,
  };
}

export function getAllBotStats(): BotStats[] {
  const db = getDb();
  const bots = db.prepare("SELECT id FROM bots").all() as Array<{ id: string }>;
  return bots.map((b) => getBotStats(b.id)).filter((s): s is BotStats => s !== null);
}
