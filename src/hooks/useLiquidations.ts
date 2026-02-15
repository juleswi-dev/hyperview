"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api } from "@/lib/hyperliquid/api";
import { wsClient, subscribeToTrades } from "@/lib/hyperliquid/websocket";
import {
  useLiquidationStore,
  selectStats,
  selectAllActivity,
} from "@/stores/liquidationStore";
import { useMarketStore } from "@/stores/marketStore";
import type { Fill } from "@/types/hyperliquid";

// Monitor top coins by OI for large trade heuristic
const MIN_MONITORED_COINS = 10;
const FALLBACK_COINS = ["BTC", "ETH", "SOL", "DOGE", "WIF", "AVAX", "ARB", "OP", "SUI", "PEPE"];

// How often to scan for confirmed liquidations via MM fills (ms)
const MM_SCAN_INTERVAL = 120_000; // every 2 minutes

export function useLiquidations() {
  const liquidations = useLiquidationStore((s) => s.liquidations);
  const largeTrades = useLiquidationStore((s) => s.largeTrades);
  const isLoading = useLiquidationStore((s) => s.isLoading);
  const error = useLiquidationStore((s) => s.error);
  const isConnected = useLiquidationStore((s) => s.isConnected);
  const lastFillTime = useLiquidationStore((s) => s.lastFillTime);
  const processFills = useLiquidationStore((s) => s.processFills);
  const processLargeTrades = useLiquidationStore((s) => s.processLargeTrades);
  const setLoading = useLiquidationStore((s) => s.setLoading);
  const setError = useLiquidationStore((s) => s.setError);
  const setConnected = useLiquidationStore((s) => s.setConnected);

  const assets = useMarketStore((s) => s.assets);
  const [now, setNow] = useState(Date.now());

  // Track discovered MM addresses for periodic scanning
  const knownMMsRef = useRef<string[]>([]);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topCoins = useMemo(() => {
    if (assets.length === 0) return FALLBACK_COINS;
    return [...assets]
      .sort((a, b) => parseFloat(b.ctx.openInterest) - parseFloat(a.ctx.openInterest))
      .slice(0, MIN_MONITORED_COINS)
      .map((a) => a.meta.name);
  }, [assets]);

  // Refresh time every 60s
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Scan active market makers' fills for confirmed liquidations.
   * This is the primary source of confirmed liquidation data since
   * HLP vault no longer has fills directly.
   */
  const scanForLiquidations = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) {
        setLoading(true);
        setError(null);
      }

      // Step 1: Discover active traders from recent trades
      const topCoinNames = topCoins.slice(0, 5);
      const activeTraders = await api.discoverActiveTraders(topCoinNames);
      knownMMsRef.current = activeTraders;

      // Step 2: Scan their fills for liquidation events (last 24h for initial, last scan period for refresh)
      const startTime = isInitial
        ? Date.now() - 24 * 60 * 60 * 1000
        : Date.now() - MM_SCAN_INTERVAL - 30_000; // overlap by 30s to not miss anything

      const liqFills = await api.scanForLiquidationFills(
        activeTraders.slice(0, 8), // limit to top 8 to respect rate limits
        startTime,
      );

      if (liqFills.length > 0) {
        processFills(liqFills);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to scan for liquidations";
      console.error("Liquidation scan failed:", e);
      if (isInitial) setError(msg);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [topCoins, processFills, setLoading, setError]);

  // Initial load + periodic scan
  useEffect(() => {
    scanForLiquidations(true);

    // Periodic re-scan for new confirmed liquidations
    scanTimerRef.current = setInterval(() => {
      scanForLiquidations(false);
    }, MM_SCAN_INTERVAL);

    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, [scanForLiquidations]);

  // WebSocket: subscribe to trades for large trade heuristic
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    const removeListener = wsClient.onConnectionChange(setConnected);
    unsubscribes.push(removeListener);

    async function connect() {
      try {
        await wsClient.connect();

        // Subscribe to top coins for large trade monitoring
        topCoins.forEach((coin) => {
          unsubscribes.push(
            subscribeToTrades(coin, (trades) => {
              processLargeTrades(
                trades as Array<{
                  coin: string;
                  side: string;
                  px: string;
                  sz: string;
                  time: number;
                  hash?: string;
                }>,
              );
            }),
          );
        });
      } catch (e) {
        console.error("WebSocket connection failed:", e);
      }
    }

    connect();
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [setConnected, processLargeTrades, topCoins]);

  const stats = useMemo(() => selectStats(liquidations, now), [liquidations, now]);
  const allActivity = useMemo(() => selectAllActivity(liquidations, largeTrades), [liquidations, largeTrades]);

  return {
    liquidations,
    largeTrades,
    allActivity,
    stats,
    isConnected,
    isLoading,
    error,
    retry: () => scanForLiquidations(true),
  };
}
