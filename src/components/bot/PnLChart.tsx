"use client";

import type { TradeRecord } from "@/types/bot";

interface PnLChartProps {
  trades: TradeRecord[];
}

export function PnLChart({ trades }: PnLChartProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No trade data for chart
      </div>
    );
  }

  // Build cumulative PnL from trades (oldest first)
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  let cumPnl = 0;
  const points = sorted.map((t) => {
    cumPnl += t.pnl - t.fee;
    return { time: t.timestamp, pnl: cumPnl };
  });

  // Simple SVG chart
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minPnl = Math.min(0, ...points.map((p) => p.pnl));
  const maxPnl = Math.max(0, ...points.map((p) => p.pnl));
  const range = maxPnl - minPnl || 1;

  const toX = (i: number) => padding.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const toY = (pnl: number) => padding.top + chartH - ((pnl - minPnl) / range) * chartH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.pnl).toFixed(1)}`)
    .join(" ");

  const zeroY = toY(0);
  const lastPnl = points[points.length - 1]?.pnl ?? 0;
  const color = lastPnl >= 0 ? "#4ade80" : "#f87171";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Zero line */}
      <line
        x1={padding.left}
        y1={zeroY}
        x2={width - padding.right}
        y2={zeroY}
        stroke="#3f3f46"
        strokeDasharray="4 4"
      />

      {/* PnL line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} />

      {/* Y axis labels */}
      <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" fill="#71717a" fontSize={10}>
        ${maxPnl.toFixed(0)}
      </text>
      <text x={padding.left - 5} y={zeroY + 4} textAnchor="end" fill="#71717a" fontSize={10}>
        $0
      </text>
      {minPnl < 0 && (
        <text x={padding.left - 5} y={height - padding.bottom + 4} textAnchor="end" fill="#71717a" fontSize={10}>
          ${minPnl.toFixed(0)}
        </text>
      )}

      {/* Current PnL label */}
      <text x={width - padding.right} y={padding.top - 5} textAnchor="end" fill={color} fontSize={12} fontWeight="bold">
        {lastPnl >= 0 ? "+" : ""}${lastPnl.toFixed(2)}
      </text>
    </svg>
  );
}
