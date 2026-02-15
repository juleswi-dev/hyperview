"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api, HLP_VAULT_ADDRESS } from "@/lib/hyperliquid/api";
import { wsClient, subscribeToUserFills, subscribeToTrades } from "@/lib/hyperliquid/websocket";
import {
  useLiquidationStore,
  selectStats,
  selectAllActivity,
} from "@/stores/liquidationStore";
import { useMarketStore } from "@/stores/marketStore";
import type { Fill } from "@/types/hyperliquid";

// Minimum number of coins to monitor for large trade heuristic.
// We pick top coins by open interest so we catch altcoin cascades too.
const MIN_MONITORED_COINS = 10;
const FALLBACK_COINS = ["BTC", "ETH", "SOL", "DOGE", "WIF", "AVAX", "ARB", "OP", "SUI", "PEPE"];

export function useLiquidations() {
  // Select individual stable action references — NOT the entire store object.
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

  // Get top coins by OI from market store for dynamic monitoring
  const assets = useMarketStore((s) => s.assets);

  const [now, setNow] = useState(Date.now());

  // Track which coins we're subscribed to for trade monitoring
  const subscribedCoinsRef = useRef<string[]>([]);

  // Compute top coins by OI
  const topCoins = useMemo(() => {
    if (assets.length === 0) return FALLBACK_COINS;
    return [...assets]
      .sort((a, b) => parseFloat(b.ctx.openInterest) - parseFloat(a.ctx.openInterest))
      .slice(0, MIN_MONITORED_COINS)
      .map((a) => a.meta.name);
  }, [assets]);

  // Refresh time every 60s so stats buckets stay accurate
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Load historical data
  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const startTime = Date.now() - 24 * 60 * 60 * 1000;
      const fills = await api.getHLPFillsByTime(startTime);
      processFills(fills);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load liquidation history";
      console.error("Failed to load liquidation history:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, processFills]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Gap-fill: backfill missed data after WS reconnection
  const gapFill = useCallback(async (fromTime: number) => {
    if (fromTime <= 0) return;
    try {
      const fills = await api.getHLPFillsByTime(fromTime);
      if (fills.length > 0) {
        processFills(fills);
      }
    } catch (e) {
      console.error("Gap-fill failed:", e);
    }
  }, [processFills]);

  // WebSocket subscriptions
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];
    let wasConnected = false;

    const removeListener = wsClient.onConnectionChange((connected) => {
      setConnected(connected);

      // When reconnecting after a disconnect, backfill the gap
      if (connected && wasConnected) {
        const lt = useLiquidationStore.getState().lastFillTime;
        if (lt > 0) {
          gapFill(lt);
        }
      }
      wasConnected = connected;
    });
    unsubscribes.push(removeListener);

    async function connect() {
      try {
        await wsClient.connect();
        wasConnected = true;

        unsubscribes.push(
          subscribeToUserFills(HLP_VAULT_ADDRESS, (data) => {
            const fills = (data as { fills?: Fill[] }).fills || [];
            processFills(fills as Fill[]);
          }),
        );

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
                }>,
              );
            }),
          );
        });
        subscribedCoinsRef.current = topCoins;
      } catch (e) {
        console.error("WebSocket connection failed:", e);
      }
    }

    connect();
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [setConnected, processFills, processLargeTrades, gapFill, topCoins]);

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
    retry: loadHistory,
  };
}
