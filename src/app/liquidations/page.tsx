"use client";

import { useMemo } from "react";
import { useLiquidations } from "@/hooks/useLiquidations";
import { Header } from "@/components/layout/Header";
import { LiquidationsFeed } from "@/components/market/LiquidationsFeed";
import { StatsCard, StatsGrid } from "@/components/market/StatsCard";
import { SkeletonStats, SkeletonFeed, Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function LiquidationsPage() {
  const { liquidations, allActivity, stats, isConnected, isLoading, error, retry } =
    useLiquidations();

  // Group liquidations by coin
  const coinStats = useMemo(() => {
    const byCoin = liquidations.reduce((acc, liq) => {
      if (!acc[liq.coin]) {
        acc[liq.coin] = { count: 0, volume: 0, longVolume: 0, shortVolume: 0 };
      }
      acc[liq.coin].count++;
      acc[liq.coin].volume += liq.value;
      if (liq.side === "long") {
        acc[liq.coin].longVolume += liq.value;
      } else {
        acc[liq.coin].shortVolume += liq.value;
      }
      return acc;
    }, {} as Record<string, { count: number; volume: number; longVolume: number; shortVolume: number }>);

    return Object.entries(byCoin)
      .map(([coin, data]) => ({ coin, ...data }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
  }, [liquidations]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Liquidations</h1>
          <p className="text-zinc-400">
            Track liquidations on Hyperliquid in real-time. Backstop liquidations from
            the HLP vault are confirmed, large trades are potential market liquidations.
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className="text-zinc-400">
            {isConnected ? "Live" : "Disconnected"}
          </span>
          {isLoading && <span className="text-zinc-500 ml-2">Loading history...</span>}
        </div>

        {error && (
          <div className="mb-6">
            <ErrorState message={error} onRetry={retry} />
          </div>
        )}

        {/* Stats Overview */}
        <section className="mb-8">
          {isLoading ? (
            <SkeletonStats />
          ) : (
            <StatsGrid>
              <StatsCard
                title="1h Liquidations"
                value={stats.count1h.toString()}
                subtitle={formatValue(stats.volume1h)}
                color="default"
              />
              <StatsCard
                title="4h Liquidations"
                value={stats.count4h.toString()}
                subtitle={formatValue(stats.volume4h)}
                color="default"
              />
              <StatsCard
                title="24h Volume"
                value={formatValue(stats.volume24h)}
                subtitle={`${stats.count24h} liquidations`}
                color="orange"
              />
              <StatsCard
                title="Largest (24h)"
                value={stats.largestLiq ? formatValue(stats.largestLiq.value) : "-"}
                subtitle={stats.largestLiq ? `${stats.largestLiq.coin} ${stats.largestLiq.side}` : ""}
                color="red"
              />
            </StatsGrid>
          )}
        </section>

        {/* Long vs Short Bar */}
        <section className="mb-8">
          {isLoading ? (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <Skeleton className="h-4 w-40 mb-3" />
              <Skeleton className="h-4 w-full rounded-full" />
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-zinc-400">Long vs Short (24h)</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-red-400">
                    Longs: {formatValue(stats.longVolume24h)}
                  </span>
                  <span className="text-green-400">
                    Shorts: {formatValue(stats.shortVolume24h)}
                  </span>
                </div>
              </div>
              <div className="h-4 bg-zinc-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-red-500 h-full transition-all duration-500"
                  style={{
                    width: `${(stats.longVolume24h / (stats.volume24h || 1)) * 100}%`,
                  }}
                />
                <div
                  className="bg-green-500 h-full transition-all duration-500"
                  style={{
                    width: `${(stats.shortVolume24h / (stats.volume24h || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Feed */}
          <div className="lg:col-span-2">
            {isLoading ? (
              <SkeletonFeed rows={12} />
            ) : (
              <LiquidationsFeed
                liquidations={allActivity}
                title="Live Liquidation Feed"
                showUser={true}
                maxItems={50}
              />
            )}
          </div>

          {/* By Coin */}
          <div className="lg:col-span-1">
            {isLoading ? (
              <SkeletonFeed rows={8} />
            ) : (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-white">By Asset (24h)</h3>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {coinStats.length === 0 ? (
                    <div className="px-4 py-8 text-center text-zinc-500 text-sm">
                      No data yet
                    </div>
                  ) : (
                    coinStats.map((coin) => (
                      <div
                        key={coin.coin}
                        className="px-4 py-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold">
                            {coin.coin.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-medium text-white">{coin.coin}</div>
                            <div className="text-xs text-zinc-500">
                              {coin.count} liquidations
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-white">
                            {formatValue(coin.volume)}
                          </div>
                          <div className="flex gap-2 text-xs">
                            <span className="text-red-400">
                              L: {formatValue(coin.longVolume)}
                            </span>
                            <span className="text-green-400">
                              S: {formatValue(coin.shortVolume)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
