"use client";

interface ActivePosition {
  coin: string;
  side: "buy" | "sell";
  entryPrice: number;
  size: number;
  orderId: string;
  enteredAt: number;
  filled: boolean;
  signalHash: string;
  signalValue: number;
}

interface ActivePositionCardProps {
  position: ActivePosition;
  currentPrice: number;
  takeProfitPercent: number;
  stopLossPercent: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

export function ActivePositionCard({ position, currentPrice, takeProfitPercent, stopLossPercent }: ActivePositionCardProps) {
  const pnlPercent = position.side === "buy"
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

  const pnlUsd = pnlPercent / 100 * position.size * position.entryPrice;
  const timeInPosition = Date.now() - position.enteredAt;

  // Calculate TP/SL bar positions
  // Range: -stopLoss to +takeProfit
  const totalRange = stopLossPercent + takeProfitPercent;
  // Where current price sits in this range (0 = SL, 1 = TP)
  const currentPos = Math.min(1, Math.max(0, (pnlPercent + stopLossPercent) / totalRange));
  const entryPos = stopLossPercent / totalRange;

  return (
    <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{position.coin}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            position.side === "buy" ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"
          }`}>
            {position.side.toUpperCase()}
          </span>
          {!position.filled && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 animate-pulse">
              PENDING
            </span>
          )}
        </div>
        <span className={`text-sm font-bold ${pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
          {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%
        </span>
      </div>

      {/* Price info */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-zinc-500">Entry</span>
          <p className="text-zinc-300 font-mono">${position.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-zinc-500">Current</span>
          <p className="text-zinc-300 font-mono">${currentPrice.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-zinc-500">PnL</span>
          <p className={`font-mono ${pnlUsd >= 0 ? "text-green-400" : "text-red-400"}`}>
            ${pnlUsd.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Progress to TP */}
      <div className="space-y-1.5">
        {/* TP progress bar */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500">
            {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}% / +{takeProfitPercent}% TP
          </span>
          <span className={pnlPercent >= 0 ? "text-green-400" : "text-red-400"}>
            {pnlPercent >= 0
              ? `${Math.min(100, (pnlPercent / takeProfitPercent) * 100).toFixed(0)}% there`
              : `${Math.min(100, (Math.abs(pnlPercent) / stopLossPercent) * 100).toFixed(0)}% to SL`
            }
          </span>
        </div>
        <div className="relative h-2.5 rounded-full overflow-hidden bg-zinc-700/80">
          {/* Red zone (SL side) */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600/50 to-zinc-600/20"
            style={{ width: `${entryPos * 100}%` }}
          />
          {/* Green zone (TP side) */}
          <div
            className="absolute inset-y-0 right-0 bg-gradient-to-l from-green-600/50 to-zinc-600/20"
            style={{ width: `${(1 - entryPos) * 100}%` }}
          />
          {/* Fill bar showing progress (green if profit, red if loss) */}
          {pnlPercent >= 0 ? (
            <div
              className="absolute inset-y-0 bg-green-500/40 rounded-r-full transition-all duration-500"
              style={{ left: `${entryPos * 100}%`, width: `${Math.min((1 - entryPos), (pnlPercent / takeProfitPercent) * (1 - entryPos)) * 100}%` }}
            />
          ) : (
            <div
              className="absolute inset-y-0 bg-red-500/40 rounded-l-full transition-all duration-500"
              style={{
                left: `${Math.max(0, entryPos - (Math.abs(pnlPercent) / stopLossPercent) * entryPos) * 100}%`,
                width: `${Math.min(entryPos, (Math.abs(pnlPercent) / stopLossPercent) * entryPos) * 100}%`,
              }}
            />
          )}
          {/* Current price marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md border border-zinc-300 transition-all duration-500"
            style={{ left: `calc(${currentPos * 100}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>SL -{stopLossPercent}%</span>
          <span>Entry</span>
          <span>TP +{takeProfitPercent}%</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>Signal: ${(position.signalValue / 1000).toFixed(0)}k liq</span>
        <span>{formatDuration(timeInPosition)}</span>
      </div>
    </div>
  );
}
