"use client";

import { useState, useEffect, useCallback } from "react";
import { wsClient, subscribeToTrades } from "@/lib/hyperliquid/websocket";
import { api } from "@/lib/hyperliquid/api";
import { Skeleton } from "@/components/ui/Skeleton";
import clsx from "clsx";

interface Trade {
  price: number;
  size: number;
  side: "buy" | "sell";
  time: number;
  hash: string;
}

interface TradesFeedProps {
  coin: string;
  maxItems?: number;
}

export function TradesFeed({ coin, maxItems = 30 }: TradesFeedProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function load() {
      try {
        setIsLoading(true);
        const recent = await api.getRecentTrades(coin);
        const mapped = recent.slice(-maxItems).reverse().map((t) => ({
          price: parseFloat(t.px),
          size: parseFloat(t.sz),
          side: (t.side === "B" ? "buy" : "sell") as "buy" | "sell",
          time: t.time,
          hash: t.hash || `${t.time}-${t.px}-${t.sz}`,
        }));
        setTrades(mapped);
      } catch (e) {
        console.error("Failed to load trades:", e);
      } finally {
        setIsLoading(false);
      }
    }

    async function connectWs() {
      try {
        await wsClient.connect();
        unsubscribe = subscribeToTrades(coin, (data) => {
          const newTrades = data.map((t) => ({
            price: parseFloat(t.px),
            size: parseFloat(t.sz),
            side: (t.side === "B" ? "buy" : "sell") as "buy" | "sell",
            time: t.time,
            hash: t.hash || `${t.time}-${t.px}-${t.sz}`,
          }));

          setTrades((prev) => {
            // Deduplicate by hash to handle REST/WS overlap
            const existing = new Set(prev.map((t) => t.hash));
            const unique = newTrades.filter((t) => !existing.has(t.hash));
            return [...unique, ...prev].slice(0, maxItems);
          });
        });
      } catch (e) {
        console.error("WS trades subscription failed:", e);
      }
    }

    load();
    connectWs();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [coin, maxItems]);

  const formatTime = useCallback((ts: number) => {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  if (isLoading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
        <Skeleton className="h-4 w-24 mb-3" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12 ml-auto" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-white">Recent Trades</span>
      </div>

      {/* Header */}
      <div className="flex text-xs text-zinc-500 px-4 py-2 border-b border-zinc-800/50">
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Size</span>
        <span className="flex-1 text-right">Time</span>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {trades.map((trade, i) => (
          <div key={trade.hash} className="flex text-xs px-4 py-1 hover:bg-zinc-800/30">
            <span
              className={clsx(
                "flex-1 font-mono",
                trade.side === "buy" ? "text-green-400" : "text-red-400"
              )}
            >
              {trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="flex-1 text-right text-zinc-300 font-mono">
              {trade.size.toFixed(4)}
            </span>
            <span className="flex-1 text-right text-zinc-500 font-mono">
              {formatTime(trade.time)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
