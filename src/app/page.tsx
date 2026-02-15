"use client";

import { useMarketData } from "@/hooks/useMarketData";
import { useLiquidations } from "@/hooks/useLiquidations";
import { Header } from "@/components/layout/Header";
import { MarketTable } from "@/components/market/MarketTable";
import { LiquidationsFeed } from "@/components/market/LiquidationsFeed";
import { StatsCard, StatsGrid } from "@/components/market/StatsCard";
import { SkeletonStats, SkeletonTable, SkeletonFeed } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function Dashboard() {
  const { topByVolume, topGainers, topLosers, isLoading, isConnected, error, getChange24h, retry } = useMarketData();
  const { allActivity, stats, isConnected: liqConnected, isLoading: liqLoading } = useLiquidations();

  const topVolumeWithChange = topByVolume.map((a) => ({
    ...a,
    change: getChange24h(a),
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connection Status */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-zinc-400">
              Market Data: {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                liqConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-zinc-400">
              Liquidations: {liqConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <>
            {/* Liquidation Stats */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-4">Liquidation Overview (24h)</h2>
              {liqLoading ? (
                <SkeletonStats />
              ) : (
                <StatsGrid>
                  <StatsCard
                    title="Total Liquidations"
                    value={stats.count24h.toString()}
                    subtitle="Confirmed backstop liquidations"
                    color="default"
                  />
                  <StatsCard
                    title="Total Volume"
                    value={formatValue(stats.volume24h)}
                    subtitle="Liquidated notional value"
                    color="orange"
                  />
                  <StatsCard
                    title="Longs Liquidated"
                    value={formatValue(stats.longVolume24h)}
                    subtitle={`${((stats.longVolume24h / (stats.volume24h || 1)) * 100).toFixed(0)}% of total`}
                    color="red"
                  />
                  <StatsCard
                    title="Shorts Liquidated"
                    value={formatValue(stats.shortVolume24h)}
                    subtitle={`${((stats.shortVolume24h / (stats.volume24h || 1)) * 100).toFixed(0)}% of total`}
                    color="green"
                  />
                </StatsGrid>
              )}
            </section>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Liquidations Feed */}
              <div className="lg:col-span-1">
                {liqLoading ? (
                  <SkeletonFeed rows={8} />
                ) : (
                  <LiquidationsFeed
                    liquidations={allActivity}
                    title="Live Activity"
                    maxItems={30}
                  />
                )}
              </div>

              {/* Markets */}
              <div className="lg:col-span-2 space-y-6">
                {isLoading ? (
                  <>
                    <SkeletonTable rows={10} cols={5} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <SkeletonTable rows={5} cols={3} />
                      <SkeletonTable rows={5} cols={3} />
                    </div>
                  </>
                ) : (
                  <>
                    <MarketTable
                      assets={topVolumeWithChange.slice(0, 10)}
                      title="Top by Volume"
                      showVolume={true}
                      showFunding={true}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <MarketTable
                        assets={topGainers.slice(0, 5)}
                        title="Top Gainers"
                        showVolume={false}
                        showFunding={false}
                        compact={true}
                      />
                      <MarketTable
                        assets={topLosers.slice(0, 5)}
                        title="Top Losers"
                        showVolume={false}
                        showFunding={false}
                        compact={true}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
