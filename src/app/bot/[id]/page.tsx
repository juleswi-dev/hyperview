"use client";

import { use } from "react";
import Link from "next/link";
import { useBotDetail } from "@/hooks/useBotDetail";
import { BotStatusBadge } from "@/components/bot/BotStatusBadge";
import { TradeHistoryTable } from "@/components/bot/TradeHistoryTable";
import { BotLogViewer } from "@/components/bot/BotLogViewer";
import { PnLChart } from "@/components/bot/PnLChart";
import { SniperDashboard } from "@/components/bot/sniper/SniperDashboard";

export default function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { bot, trades, logs } = useBotDetail(id);

  if (!bot) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-64 flex items-center justify-center text-zinc-400">
          Loading bot...
        </div>
      </div>
    );
  }

  const handleStartStop = async () => {
    const action = bot.status === "running" ? "stop" : "start";
    try {
      const res = await fetch(`/api/bot/${id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? `Failed to ${action} bot`);
      }
    } catch {
      alert(`Failed to ${action} bot`);
    }
  };

  const isSniper = bot.strategyId === "liquidation-sniper";

  // Compute stats from trades (used for default view)
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl - t.fee, 0);
  const winningTrades = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length > 0 ? ((winningTrades / trades.length) * 100).toFixed(1) : "0.0";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/bot" className="text-zinc-500 hover:text-zinc-300 text-sm">&larr; Bots</Link>
          </div>
          <h1 className="text-2xl font-bold text-white">{bot.name}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {bot.strategyId.toUpperCase()} - {bot.coins.join(", ")} - {bot.mode}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BotStatusBadge status={bot.status} />
          <button
            onClick={handleStartStop}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              bot.status === "running"
                ? "bg-red-900/30 text-red-400 hover:bg-red-900/50"
                : "bg-green-900/30 text-green-400 hover:bg-green-900/50"
            }`}
          >
            {bot.status === "running" ? "Stop" : "Start"}
          </button>
        </div>
      </div>

      {bot.lastError && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {bot.lastError}
        </div>
      )}

      {/* Sniper-specific dashboard or default layout */}
      {isSniper ? (
        <SniperDashboard bot={bot} trades={trades} logs={logs} />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatBox label="Total PnL" value={`$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? "green" : "red"} />
            <StatBox label="Trades" value={String(trades.length)} />
            <StatBox label="Win Rate" value={`${winRate}%`} />
            <StatBox label="Peak Equity" value={`$${bot.peakEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          </div>

          {/* PnL Chart */}
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">Cumulative PnL</h2>
            <PnLChart trades={trades} />
          </div>

          {/* Trades & Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Trade History</h2>
              <TradeHistoryTable trades={trades} />
            </div>
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Logs</h2>
              <BotLogViewer logs={logs} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4">
      <span className="text-xs text-zinc-500">{label}</span>
      <p className={`text-xl font-bold mt-1 ${
        color === "green" ? "text-green-400" : color === "red" ? "text-red-400" : "text-white"
      }`}>
        {value}
      </p>
    </div>
  );
}
