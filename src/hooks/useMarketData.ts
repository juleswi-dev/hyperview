"use client";

import { useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/hyperliquid/api";
import { wsClient, subscribeToAllMids } from "@/lib/hyperliquid/websocket";
import { useMarketStore, getChange24h } from "@/stores/marketStore";

export function useMarketData() {
  const {
    assets, mids, isLoading, error, isConnected,
    setAssets, setMids, setLoading, setError, setConnected,
  } = useMarketStore();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [meta, ctxs] = await api.getMetaAndAssetCtxs();
      setAssets(meta.universe, ctxs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load market data");
    } finally {
      setLoading(false);
    }
  }, [setAssets, setLoading, setError]);

  // Initial fetch + auto-refresh every 60s
  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 60_000);
    return () => clearInterval(timer);
  }, [loadData]);

  // WebSocket for live prices
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const removeListener = wsClient.onConnectionChange(setConnected);

    async function connectWs() {
      try {
        await wsClient.connect();
        unsubscribe = subscribeToAllMids(setMids);
      } catch (e) {
        console.error("WebSocket connection failed:", e);
      }
    }

    connectWs();
    return () => {
      removeListener();
      if (unsubscribe) unsubscribe();
    };
  }, [setMids, setConnected]);

  const change24h = useCallback(
    (asset: { meta: { name: string }; ctx: { markPx: string; prevDayPx: string } }) =>
      getChange24h(asset as Parameters<typeof getChange24h>[0], mids),
    [mids],
  );

  const assetsWithPrices = useMemo(
    () => assets.map((a) => ({ ...a, midPrice: mids[a.meta.name] || a.ctx.markPx })),
    [assets, mids],
  );

  const topByVolume = useMemo(
    () =>
      [...assetsWithPrices]
        .sort((a, b) => parseFloat(b.ctx.dayNtlVlm) - parseFloat(a.ctx.dayNtlVlm))
        .slice(0, 20),
    [assetsWithPrices],
  );

  const topGainers = useMemo(
    () =>
      [...assetsWithPrices]
        .map((a) => ({ ...a, change: change24h(a) }))
        .sort((a, b) => b.change - a.change)
        .slice(0, 10),
    [assetsWithPrices, change24h],
  );

  const topLosers = useMemo(
    () =>
      [...assetsWithPrices]
        .map((a) => ({ ...a, change: change24h(a) }))
        .sort((a, b) => a.change - b.change)
        .slice(0, 10),
    [assetsWithPrices, change24h],
  );

  return {
    assets: assetsWithPrices,
    topByVolume,
    topGainers,
    topLosers,
    mids,
    isLoading,
    isConnected,
    error,
    getChange24h: change24h,
    retry: loadData,
  };
}
