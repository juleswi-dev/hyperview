"use client";

interface SniperStatsProps {
  signalsDetected: number;
  tradesTriggered: number;
  hitRate: number;
  netPnl: number;
  unrealizedPnl: number;
  activePositions: number;
}

export function SniperStats({ signalsDetected, tradesTriggered, hitRate, netPnl, unrealizedPnl, activePositions }: SniperStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Signals Detected */}
      <div className="bg-gradient-to-br from-violet-900/20 to-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs text-zinc-500">Signals (24h)</span>
        </div>
        <p className="text-xl font-bold text-white">{signalsDetected}</p>
      </div>

      {/* Trades Triggered */}
      <div className="bg-gradient-to-br from-blue-900/20 to-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="12" />
            <line x1="12" y1="12" x2="17" y2="7" />
          </svg>
          <span className="text-xs text-zinc-500">Trades</span>
        </div>
        <p className="text-xl font-bold text-white">{tradesTriggered}</p>
        {signalsDetected > 0 && (
          <p className="text-xs text-zinc-500 mt-0.5">
            {((tradesTriggered / signalsDetected) * 100).toFixed(0)}% trigger rate
          </p>
        )}
      </div>

      {/* Hit Rate */}
      <div className="bg-gradient-to-br from-emerald-900/20 to-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <span className="text-xs text-zinc-500">Win Rate</span>
        </div>
        <p className={`text-xl font-bold ${hitRate >= 50 ? "text-emerald-400" : hitRate > 0 ? "text-amber-400" : "text-zinc-400"}`}>
          {hitRate.toFixed(1)}%
        </p>
      </div>

      {/* Net PnL */}
      <div className={`bg-gradient-to-br ${netPnl >= 0 ? "from-green-900/20" : "from-red-900/20"} to-zinc-900/50 border border-zinc-800 rounded-xl p-4`}>
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-zinc-500">Net PnL</span>
        </div>
        <p className={`text-xl font-bold ${netPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
          ${netPnl.toFixed(2)}
        </p>
        {activePositions > 0 && unrealizedPnl !== 0 && (
          <p className={`text-xs mt-0.5 ${unrealizedPnl >= 0 ? "text-green-400/70" : "text-red-400/70"}`}>
            {unrealizedPnl >= 0 ? "+" : ""}{unrealizedPnl.toFixed(2)} unrealized
          </p>
        )}
      </div>
    </div>
  );
}
