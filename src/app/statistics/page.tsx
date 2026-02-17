"use client";

import { useBotStats } from "@/hooks/useBotStats";
import { PerformanceOverview } from "@/components/statistics/PerformanceOverview";
import { StrategyComparison } from "@/components/statistics/StrategyComparison";

export default function StatisticsPage() {
  const { aggregate, botStats, isLoading, error } = useBotStats();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Statistics</h1>
      <p className="text-sm text-zinc-400 mb-8">Performance overview across all trading bots</p>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-24 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : aggregate ? (
        <>
          <div className="mb-8">
            <PerformanceOverview stats={aggregate} />
          </div>

          <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Bot Comparison</h2>
            <StrategyComparison botStats={botStats} />
          </div>

          {/* Per-bot detail table */}
          {botStats.length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Detailed Stats</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                      <th className="text-left py-2 px-3">Bot</th>
                      <th className="text-left py-2 px-3">Strategy</th>
                      <th className="text-right py-2 px-3">Trades</th>
                      <th className="text-right py-2 px-3">Win Rate</th>
                      <th className="text-right py-2 px-3">PnL</th>
                      <th className="text-right py-2 px-3">Sharpe</th>
                      <th className="text-right py-2 px-3">Max DD</th>
                      <th className="text-right py-2 px-3">Avg Win</th>
                      <th className="text-right py-2 px-3">Avg Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botStats.map((stat) => (
                      <tr key={stat.botId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-2 px-3 text-white font-medium">{stat.botName}</td>
                        <td className="py-2 px-3 text-zinc-400 uppercase text-xs">{stat.strategyId}</td>
                        <td className="py-2 px-3 text-right text-white">{stat.totalTrades}</td>
                        <td className={`py-2 px-3 text-right ${stat.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>
                          {stat.winRate.toFixed(1)}%
                        </td>
                        <td className={`py-2 px-3 text-right font-medium ${stat.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                          ${stat.totalPnl.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-300">{stat.sharpeRatio.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-red-400">{stat.maxDrawdown.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right text-green-400">${stat.avgWin.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-red-400">${stat.avgLoss.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-zinc-400">
          No statistics available yet. Create and run some bots first.
        </div>
      )}
    </div>
  );
}
