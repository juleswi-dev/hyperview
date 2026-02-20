"use client";

import { useState, useEffect, useCallback } from "react";
import type { LiquidationSignal } from "@/lib/bot/feeds/LiquidationFeed";

interface SignalStats {
  totalDetected: number;
  totalActedOn: number;
  qualifyingLast24h: number;
  confirmedLast24h: number;
  feedRunning: boolean;
  consumerCount: number;
}

interface SniperSignalsData {
  signals: LiquidationSignal[];
  stats: SignalStats;
  isLoading: boolean;
}

export function useSniperSignals(botId: string): SniperSignalsData {
  const [signals, setSignals] = useState<LiquidationSignal[]>([]);
  const [stats, setStats] = useState<SignalStats>({
    totalDetected: 0,
    totalActedOn: 0,
    qualifyingLast24h: 0,
    confirmedLast24h: 0,
    feedRunning: false,
    consumerCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch(`/api/bot/${botId}/signals`);
      if (!res.ok) return;
      const data = await res.json();
      setSignals(data.signals);
      setStats(data.stats);
    } catch {
      // Silently fail for polling
    } finally {
      setIsLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 3000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  return { signals, stats, isLoading };
}
