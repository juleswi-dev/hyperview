"use client";

import React from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Asset } from "@/types/hyperliquid";

interface MarketTableProps {
  assets: Array<Asset & { midPrice?: string; change?: number }>;
  title?: string;
  showVolume?: boolean;
  showFunding?: boolean;
  showOI?: boolean;
  compact?: boolean;
}

function formatNumber(num: number, decimals = 2): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(decimals)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(decimals)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(decimals)}K`;
  return num.toFixed(decimals);
}

function formatPrice(price: string | number, szDecimals?: number): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (szDecimals !== undefined) {
    if (num >= 1000) return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 1) return num.toFixed(Math.max(2, Math.min(szDecimals, 6)));
    return num.toFixed(Math.max(4, Math.min(szDecimals + 2, 8)));
  }
  if (num >= 1000) return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return num.toFixed(2);
  if (num >= 0.01) return num.toFixed(4);
  return num.toFixed(6);
}

function formatFunding(rate: string): string {
  const num = parseFloat(rate) * 100;
  return `${num >= 0 ? "+" : ""}${num.toFixed(4)}%`;
}

export const MarketTable = React.memo(function MarketTable({
  assets,
  title,
  showVolume = true,
  showFunding = true,
  showOI = false,
  compact = false,
}: MarketTableProps) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {title && (
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-zinc-500 border-b border-zinc-800">
              <th className="text-left px-4 py-3 font-medium">Asset</th>
              <th className="text-right px-4 py-3 font-medium">Price</th>
              <th className="text-right px-4 py-3 font-medium">24h %</th>
              {showVolume && (
                <th className="text-right px-4 py-3 font-medium">24h Volume</th>
              )}
              {showFunding && (
                <th className="text-right px-4 py-3 font-medium">Funding (8h)</th>
              )}
              {showOI && (
                <th className="text-right px-4 py-3 font-medium">Open Interest</th>
              )}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const change = asset.change ?? 0;
              const price = asset.midPrice || asset.ctx.markPx;
              const volume = parseFloat(asset.ctx.dayNtlVlm);
              const funding = asset.ctx.funding;
              const oi = parseFloat(asset.ctx.openInterest);

              return (
                <tr
                  key={asset.meta.name}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/markets/${asset.meta.name}`}
                      className="flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        {asset.meta.name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-white">
                          {asset.meta.name}
                        </div>
                        {!compact && (
                          <div className="text-xs text-zinc-500">
                            {asset.meta.maxLeverage}x max
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>

                  <td className="text-right px-4 py-3">
                    <span className="text-white font-mono">
                      ${formatPrice(price, asset.meta.szDecimals)}
                    </span>
                  </td>

                  <td className="text-right px-4 py-3">
                    <span
                      className={clsx(
                        "font-mono",
                        change > 0 && "text-green-400",
                        change < 0 && "text-red-400",
                        change === 0 && "text-zinc-400"
                      )}
                    >
                      {change > 0 ? "+" : ""}
                      {change.toFixed(2)}%
                    </span>
                  </td>

                  {showVolume && (
                    <td className="text-right px-4 py-3">
                      <span className="text-zinc-300 font-mono">
                        ${formatNumber(volume)}
                      </span>
                    </td>
                  )}

                  {showFunding && (
                    <td className="text-right px-4 py-3">
                      <span
                        className={clsx(
                          "font-mono text-sm",
                          parseFloat(funding) > 0 && "text-green-400",
                          parseFloat(funding) < 0 && "text-red-400",
                          parseFloat(funding) === 0 && "text-zinc-400"
                        )}
                      >
                        {formatFunding(funding)}
                      </span>
                    </td>
                  )}

                  {showOI && (
                    <td className="text-right px-4 py-3">
                      <span className="text-zinc-300 font-mono">
                        ${formatNumber(oi * parseFloat(asset.ctx.markPx))}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
