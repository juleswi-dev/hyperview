"use client";

import type { AggregateStats } from "@/lib/bot/persistence/statsRepo";

interface PerformanceOverviewProps {
  stats: AggregateStats;
}

export function PerformanceOverview({ stats }: PerformanceOverviewProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total PnL" value={`$${stats.totalPnl.toFixed(2)}`} color={stats.totalPnl >= 0 ? "green" : "red"} />
      <StatCard label="Total Trades" value={String(stats.totalTrades)} />
      <StatCard label="Win Rate" value={`${stats.overallWinRate.toFixed(1)}%`} color={stats.overallWinRate >= 50 ? "green" : "red"} />
      <StatCard label="Total Fees" value={`$${stats.totalFees.toFixed(2)}`} color="red" />
      <StatCard label="Active Bots" value={`${stats.runningBots} / ${stats.totalBots}`} />
      <StatCard
        label="Best Bot"
        value={stats.bestBot ? `${stats.bestBot.name}` : "-"}
        subtitle={stats.bestBot ? `$${stats.bestBot.pnl.toFixed(2)}` : undefined}
        color="green"
      />
      <StatCard
        label="Worst Bot"
        value={stats.worstBot ? `${stats.worstBot.name}` : "-"}
        subtitle={stats.worstBot ? `$${stats.worstBot.pnl.toFixed(2)}` : undefined}
        color="red"
      />
      <StatCard label="Net PnL" value={`$${(stats.totalPnl - stats.totalFees).toFixed(2)}`} color={stats.totalPnl - stats.totalFees >= 0 ? "green" : "red"} />
    </div>
  );
}

function StatCard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: "green" | "red" }) {
  return (
    <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-xl border border-zinc-800 p-4">
      <span className="text-xs text-zinc-500">{label}</span>
      <p className={`text-lg font-bold mt-1 ${
        color === "green" ? "text-green-400" : color === "red" ? "text-red-400" : "text-white"
      }`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}
