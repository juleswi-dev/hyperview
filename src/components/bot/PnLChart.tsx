"use client";

import type { TradeRecord } from "@/types/bot";

interface PnLChartProps {
  trades: TradeRecord[];
  unrealizedPnl?: number;
}

export function PnLChart({ trades, unrealizedPnl = 0 }: PnLChartProps) {
  // Build cumulative PnL from trades (oldest first)
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  let cumPnl = 0;
  const points = sorted.map((t) => {
    cumPnl += t.pnl - t.fee;
    return { time: t.timestamp, pnl: cumPnl, isLive: false };
  });

  // Append a live "now" point with unrealized PnL
  const realizedTotal = cumPnl;
  const liveTotal = realizedTotal + unrealizedPnl;
  points.push({ time: Date.now(), pnl: liveTotal, isLive: true });

  if (points.length <= 1 && trades.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No trade data for chart
      </div>
    );
  }

  // Simple SVG chart
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allPnls = points.map((p) => p.pnl);
  const minPnl = Math.min(0, ...allPnls);
  const maxPnl = Math.max(0, ...allPnls);
  const range = maxPnl - minPnl || 1;

  const toX = (i: number) => padding.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const toY = (pnl: number) => padding.top + chartH - ((pnl - minPnl) / range) * chartH;

  // Split into realized path and dashed live segment
  const realizedPoints = points.filter((p) => !p.isLive);
  const realizedPathD = realizedPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.pnl).toFixed(1)}`)
    .join(" ");

  // Dashed line from last realized to live point
  const lastRealizedIdx = realizedPoints.length - 1;
  const liveIdx = points.length - 1;
  const liveSegmentD = lastRealizedIdx >= 0
    ? `M ${toX(lastRealizedIdx).toFixed(1)} ${toY(realizedPoints[lastRealizedIdx].pnl).toFixed(1)} L ${toX(liveIdx).toFixed(1)} ${toY(liveTotal).toFixed(1)}`
    : `M ${toX(0).toFixed(1)} ${toY(0).toFixed(1)} L ${toX(liveIdx).toFixed(1)} ${toY(liveTotal).toFixed(1)}`;

  const zeroY = toY(0);
  const color = liveTotal >= 0 ? "#4ade80" : "#f87171";
  const liveX = toX(liveIdx);
  const liveY = toY(liveTotal);

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

      {/* Realized PnL line (solid) */}
      {realizedPathD && (
        <path d={realizedPathD} fill="none" stroke={color} strokeWidth={2} />
      )}

      {/* Live segment (dashed) */}
      <path d={liveSegmentD} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 3" opacity={0.7} />

      {/* Live dot (pulsing) */}
      <circle cx={liveX} cy={liveY} r={4} fill={color} opacity={0.3}>
        <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={liveX} cy={liveY} r={3} fill={color} />

      {/* Y axis labels */}
      <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" fill="#71717a" fontSize={10}>
        ${maxPnl.toFixed(2)}
      </text>
      <text x={padding.left - 5} y={zeroY + 4} textAnchor="end" fill="#71717a" fontSize={10}>
        $0
      </text>
      {minPnl < 0 && (
        <text x={padding.left - 5} y={height - padding.bottom + 4} textAnchor="end" fill="#71717a" fontSize={10}>
          ${minPnl.toFixed(2)}
        </text>
      )}

      {/* Current PnL label */}
      <text x={width - padding.right} y={padding.top - 5} textAnchor="end" fill={color} fontSize={12} fontWeight="bold">
        ${liveTotal >= 0 ? "+" : ""}{liveTotal.toFixed(2)}
      </text>
    </svg>
  );
}
