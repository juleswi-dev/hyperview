"use client";

import { useState, useEffect, useCallback } from "react";
import type { BotStats, AggregateStats } from "@/lib/bot/persistence/statsRepo";

interface StatsData {
  aggregate: AggregateStats;
  botStats: BotStats[];
}

export function useBotStats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/statistics");
      if (!res.ok) throw new Error("Failed to fetch statistics");
      const stats: StatsData = await res.json();
      setData(stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch statistics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    aggregate: data?.aggregate ?? null,
    botStats: data?.botStats ?? [],
    isLoading,
    error,
    refresh: fetchStats,
  };
}
