"use client";

import type { LiquidationSignal } from "@/lib/bot/feeds/LiquidationFeed";

interface SignalFeedProps {
  signals: LiquidationSignal[];
  triggeredHashes: Set<string>;
}

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatValue(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

export function SignalFeed({ signals, triggeredHashes }: SignalFeedProps) {
  if (signals.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-zinc-500 text-sm">
        Waiting for liquidation signals...
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
      {signals.slice(0, 50).map((signal) => {
        const isTriggered = triggeredHashes.has(signal.hash);
        const isLong = signal.side === "long";

        return (
          <div
            key={signal.hash}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-lg border-l-2 transition-all duration-300
              ${isLong ? "border-l-red-500" : "border-l-green-500"}
              ${signal.isConfirmed ? "bg-zinc-800/30" : "bg-zinc-800/15 border-dashed opacity-70"}
              ${isTriggered ? "shadow-[0_0_12px_rgba(59,130,246,0.15)]" : ""}
              animate-[slideIn_0.3s_ease-out]
            `}
          >
            {/* Coin + Side */}
            <div className="min-w-[90px]">
              <span className="text-sm font-medium text-white">{signal.coin}</span>
              <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                isLong ? "bg-red-900/40 text-red-400" : "bg-green-900/40 text-green-400"
              }`}>
                {isLong ? "LONG LIQ" : "SHORT LIQ"}
              </span>
            </div>

            {/* Value */}
            <div className="flex-1 text-right">
              <span className="text-sm font-mono text-zinc-300">{formatValue(signal.value)}</span>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-1.5 min-w-[80px] justify-end">
              {!signal.isConfirmed && (
                <span className="text-[9px] text-zinc-500 italic">est.</span>
              )}
              {isTriggered && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400">
                  TRIGGERED
                </span>
              )}
            </div>

            {/* Time */}
            <span className="text-xs text-zinc-500 min-w-[50px] text-right">
              {timeAgo(signal.time)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
