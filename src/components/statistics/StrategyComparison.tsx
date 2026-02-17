"use client";

import type { BotStats } from "@/lib/bot/persistence/statsRepo";
import clsx from "clsx";

interface StrategyComparisonProps {
  botStats: BotStats[];
}

export function StrategyComparison({ botStats }: StrategyComparisonProps) {
  if (botStats.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No bot data available
      </div>
    );
  }

  // Sort by PnL descending
  const sorted = [...botStats].sort((a, b) => b.totalPnl - a.totalPnl);
  const maxPnl = Math.max(...sorted.map((s) => Math.abs(s.totalPnl)), 1);

  return (
    <div className="space-y-3">
      {sorted.map((stat) => {
        const barWidth = Math.abs(stat.totalPnl) / maxPnl * 100;
        const isPositive = stat.totalPnl >= 0;

        return (
          <div key={stat.botId} className="flex items-center gap-4">
            <div className="w-32 shrink-0">
              <p className="text-sm text-white font-medium truncate">{stat.botName}</p>
              <p className="text-xs text-zinc-500">{stat.strategyId.toUpperCase()}</p>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-6 bg-zinc-800 rounded overflow-hidden relative">
                <div
                  className={clsx(
                    "h-full rounded transition-all",
                    isPositive ? "bg-green-500/40" : "bg-red-500/40",
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className={clsx(
                "text-sm font-medium w-24 text-right",
                isPositive ? "text-green-400" : "text-red-400",
              )}>
                {isPositive ? "+" : ""}${stat.totalPnl.toFixed(2)}
              </span>
            </div>
            <div className="w-16 text-right">
              <span className="text-xs text-zinc-400">{stat.winRate.toFixed(0)}% WR</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
