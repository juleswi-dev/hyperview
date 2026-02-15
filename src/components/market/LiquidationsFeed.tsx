"use client";

import React, { useMemo } from "react";
import clsx from "clsx";
import type { Liquidation } from "@/types/hyperliquid";

interface LiquidationsFeedProps {
  liquidations: Array<Liquidation & { isConfirmed?: boolean }>;
  title?: string;
  showUser?: boolean;
  maxItems?: number;
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const LiquidationsFeed = React.memo(function LiquidationsFeed({
  liquidations,
  title = "Liquidations",
  showUser = false,
  maxItems = 20,
}: LiquidationsFeedProps) {
  const items = useMemo(() => liquidations.slice(0, maxItems), [liquidations, maxItems]);

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-zinc-500">
          {liquidations.length} events
        </span>
      </div>

      <div className="divide-y divide-zinc-800/50 max-h-[600px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-500 text-sm">
            No liquidations yet
          </div>
        ) : (
          items.map((liq, i) => (
            <div
              key={`${liq.hash}-${i}`}
              className={clsx(
                "px-4 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors",
                !liq.isConfirmed && "opacity-60"
              )}
            >
              <div className="flex items-center gap-3">
                {/* Side indicator */}
                <div
                  className={clsx(
                    "w-1 h-10 rounded-full",
                    liq.side === "long" ? "bg-red-500" : "bg-green-500"
                  )}
                />

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{liq.coin}</span>
                    <span
                      className={clsx(
                        "text-xs px-1.5 py-0.5 rounded",
                        liq.side === "long"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-green-500/20 text-green-400"
                      )}
                    >
                      {liq.side.toUpperCase()}
                    </span>
                    {liq.method === "backstop" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        BACKSTOP
                      </span>
                    )}
                    {!liq.isConfirmed && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                        LARGE TRADE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {liq.size.toFixed(4)} @ ${liq.price.toLocaleString()}
                    {showUser && liq.liquidatedUser && (
                      <span className="ml-2 text-zinc-600">
                        {shortenAddress(liq.liquidatedUser)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div
                  className={clsx(
                    "font-mono font-medium",
                    liq.value >= 100_000 ? "text-orange-400" : "text-white"
                  )}
                >
                  {formatValue(liq.value)}
                </div>
                <div className="text-xs text-zinc-500">{formatTime(liq.time)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
