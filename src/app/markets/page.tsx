"use client";

import { useState } from "react";
import { useMarketData } from "@/hooks/useMarketData";
import { Header } from "@/components/layout/Header";
import { MarketTable } from "@/components/market/MarketTable";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import clsx from "clsx";

type SortKey = "volume" | "change" | "funding" | "oi" | "name";
type SortDirection = "asc" | "desc";

export default function MarketsPage() {
  const { assets, isLoading, isConnected, error, getChange24h, retry } = useMarketData();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Add change to all assets
  const assetsWithChange = assets.map((a) => ({
    ...a,
    change: getChange24h(a),
  }));

  // Filter by search
  const filtered = assetsWithChange.filter((a) =>
    a.meta.name.toLowerCase().includes(search.toLowerCase())
  );

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let aVal: number, bVal: number;

    switch (sortKey) {
      case "volume":
        aVal = parseFloat(a.ctx.dayNtlVlm);
        bVal = parseFloat(b.ctx.dayNtlVlm);
        break;
      case "change":
        aVal = a.change;
        bVal = b.change;
        break;
      case "funding":
        aVal = parseFloat(a.ctx.funding);
        bVal = parseFloat(b.ctx.funding);
        break;
      case "oi":
        aVal = parseFloat(a.ctx.openInterest);
        bVal = parseFloat(b.ctx.openInterest);
        break;
      case "name":
        return sortDirection === "asc"
          ? a.meta.name.localeCompare(b.meta.name)
          : b.meta.name.localeCompare(a.meta.name);
      default:
        return 0;
    }

    return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Markets</h1>
          <p className="text-zinc-400">
            All perpetual markets on Hyperliquid with real-time prices.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
            />
          </div>

          {/* Sort buttons */}
          <div className="flex gap-2">
            {[
              { key: "volume" as SortKey, label: "Volume" },
              { key: "change" as SortKey, label: "24h %" },
              { key: "funding" as SortKey, label: "Funding" },
              { key: "oi" as SortKey, label: "OI" },
            ].map((btn) => (
              <button
                key={btn.key}
                onClick={() => handleSort(btn.key)}
                className={clsx(
                  "px-3 py-2 text-sm rounded-lg border transition-colors",
                  sortKey === btn.key
                    ? "bg-zinc-800 border-zinc-700 text-white"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                )}
              >
                {btn.label}
                {sortKey === btn.key && (
                  <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Connection Status */}
        <div className="mb-4 flex items-center gap-2 text-sm">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-zinc-400">
            {isConnected ? "Live" : "Disconnected"}
          </span>
          <span className="text-zinc-600 ml-2">
            {sorted.length} markets
          </span>
        </div>

        {/* Table */}
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : isLoading ? (
          <SkeletonTable rows={20} cols={6} />
        ) : (
          <MarketTable
            assets={sorted}
            showVolume={true}
            showFunding={true}
            showOI={true}
          />
        )}
      </main>
    </div>
  );
}
