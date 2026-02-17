"use client";

import clsx from "clsx";
import type { TradeRecord } from "@/types/bot";

interface TradeHistoryTableProps {
  trades: TradeRecord[];
}

export function TradeHistoryTable({ trades }: TradeHistoryTableProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No trades yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 text-xs border-b border-zinc-800">
            <th className="text-left py-2 px-3">Time</th>
            <th className="text-left py-2 px-3">Coin</th>
            <th className="text-left py-2 px-3">Side</th>
            <th className="text-right py-2 px-3">Size</th>
            <th className="text-right py-2 px-3">Price</th>
            <th className="text-right py-2 px-3">Fee</th>
            <th className="text-right py-2 px-3">PnL</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="py-2 px-3 text-zinc-400">
                {new Date(trade.timestamp).toLocaleTimeString()}
              </td>
              <td className="py-2 px-3 text-white font-medium">{trade.coin}</td>
              <td className={clsx("py-2 px-3 font-medium", trade.side === "buy" ? "text-green-400" : "text-red-400")}>
                {trade.side.toUpperCase()}
              </td>
              <td className="py-2 px-3 text-right text-white">{trade.size.toFixed(6)}</td>
              <td className="py-2 px-3 text-right text-white">${trade.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-right text-zinc-400">${trade.fee.toFixed(4)}</td>
              <td className={clsx("py-2 px-3 text-right font-medium",
                trade.pnl > 0 ? "text-green-400" : trade.pnl < 0 ? "text-red-400" : "text-zinc-400"
              )}>
                {trade.pnl !== 0 ? `$${trade.pnl.toFixed(2)}` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
