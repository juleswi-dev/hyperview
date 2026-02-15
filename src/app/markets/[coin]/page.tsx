"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api } from "@/lib/hyperliquid/api";
import { wsClient, subscribeToAllMids } from "@/lib/hyperliquid/websocket";
import { Header } from "@/components/layout/Header";
import { PriceChart } from "@/components/charts/PriceChart";
import { OrderBook } from "@/components/market/OrderBook";
import { TradesFeed } from "@/components/market/TradesFeed";
import { StatsCard, StatsGrid } from "@/components/market/StatsCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import clsx from "clsx";
import type { AssetMeta, AssetCtx } from "@/types/hyperliquid";

interface MarketInfo {
  meta: AssetMeta;
  ctx: AssetCtx;
  index: number;
}

function formatPrice(price: string | number, szDecimals?: number): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  // Use szDecimals-based precision when available, otherwise auto-detect
  if (szDecimals !== undefined) {
    // Price precision is roughly inverse of size decimals for most assets
    // but we cap based on magnitude to avoid absurd display
    if (num >= 1000) return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 1) return num.toFixed(Math.max(2, Math.min(szDecimals, 6)));
    return num.toFixed(Math.max(4, Math.min(szDecimals + 2, 8)));
  }
  if (num >= 1000) return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return num.toFixed(4);
  if (num >= 0.01) return num.toFixed(4);
  return num.toFixed(6);
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

export default function MarketDetailPage({ params }: { params: Promise<{ coin: string }> }) {
  const { coin } = use(params);
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [livePrice, setLivePrice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadMarketInfo() {
    try {
      setIsLoading(true);
      setError(null);
      const [meta, ctxs] = await api.getMetaAndAssetCtxs();
      const idx = meta.universe.findIndex((m) => m.name === coin);
      if (idx === -1) {
        setError(`Market "${coin}" not found`);
        return;
      }
      setInfo({ meta: meta.universe[idx], ctx: ctxs[idx], index: idx });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load market data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMarketInfo();
  }, [coin]);

  // Live price via WS
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function connectWs() {
      try {
        await wsClient.connect();
        unsubscribe = subscribeToAllMids((data) => {
          if (data[coin]) setLivePrice(data[coin]);
        });
      } catch (e) {
        console.error("WS failed:", e);
      }
    }

    connectWs();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [coin]);

  const currentPrice = livePrice || info?.ctx.markPx || "0";
  const prevDayPx = info ? parseFloat(info.ctx.prevDayPx) : 0;
  const change = prevDayPx > 0
    ? ((parseFloat(currentPrice) - prevDayPx) / prevDayPx) * 100
    : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
          <Link href="/markets" className="hover:text-white transition-colors">Markets</Link>
          <span>/</span>
          <span className="text-white">{coin}</span>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={loadMarketInfo} />
        ) : (
          <>
            {/* Market Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg font-bold">
                  {coin.slice(0, 2)}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{coin}-PERP</h1>
                  <div className="flex items-center gap-3 mt-1">
                    {isLoading ? (
                      <Skeleton className="h-6 w-32" />
                    ) : (
                      <>
                        <span className="text-xl font-mono">${formatPrice(currentPrice)}</span>
                        <span
                          className={clsx(
                            "text-sm font-mono px-2 py-0.5 rounded",
                            change > 0 ? "text-green-400 bg-green-500/10" : change < 0 ? "text-red-400 bg-red-500/10" : "text-zinc-400"
                          )}
                        >
                          {change > 0 ? "+" : ""}{change.toFixed(2)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {info && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-zinc-400">
                  <span className="px-2 py-1 bg-zinc-800 rounded">{info.meta.maxLeverage}x max</span>
                </div>
              )}
            </div>

            {/* Stats */}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                ))}
              </div>
            ) : info && (
              <StatsGrid>
                <StatsCard
                  title="24h Volume"
                  value={formatNumber(parseFloat(info.ctx.dayNtlVlm))}
                  color="default"
                />
                <StatsCard
                  title="Open Interest"
                  value={formatNumber(parseFloat(info.ctx.openInterest) * parseFloat(info.ctx.markPx))}
                  color="blue"
                />
                <StatsCard
                  title="Funding Rate"
                  value={`${(parseFloat(info.ctx.funding) * 100).toFixed(4)}%`}
                  subtitle={`8h rate (${(parseFloat(info.ctx.funding) * 100 * 3 * 365).toFixed(1)}% ann.)`}
                  color={parseFloat(info.ctx.funding) >= 0 ? "green" : "red"}
                />
                <StatsCard
                  title="Oracle Price"
                  value={`$${formatPrice(info.ctx.oraclePx)}`}
                  color="default"
                />
              </StatsGrid>
            )}

            {/* Chart + Order Book + Trades */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
              {/* Chart */}
              <div className="lg:col-span-3">
                <PriceChart coin={coin} />
              </div>

              {/* Order Book */}
              <div className="lg:col-span-1">
                <OrderBook coin={coin} />
              </div>
            </div>

            {/* Trades */}
            <div className="mt-6">
              <TradesFeed coin={coin} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
