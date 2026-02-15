"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/hyperliquid/api";
import { wsClient, subscribeToL2Book } from "@/lib/hyperliquid/websocket";
import { Skeleton } from "@/components/ui/Skeleton";

interface OrderBookProps {
  coin: string;
  levels?: number;
}

interface Level {
  price: number;
  size: number;
  total: number;
}

/**
 * Determine appropriate price decimal places based on price magnitude.
 * Uses the same logic as formatPrice for consistency.
 */
function getPriceDecimals(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 4;
  return 6;
}

export function OrderBook({ coin, levels = 12 }: OrderBookProps) {
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const processBook = useCallback(
    (bookLevels: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>]) => {
      const rawBids = bookLevels[0].slice(0, levels).map((l) => ({
        price: parseFloat(l.px),
        size: parseFloat(l.sz),
        total: 0,
      }));
      const rawAsks = bookLevels[1].slice(0, levels).map((l) => ({
        price: parseFloat(l.px),
        size: parseFloat(l.sz),
        total: 0,
      }));

      let bidTotal = 0;
      rawBids.forEach((b) => { bidTotal += b.size; b.total = bidTotal; });
      let askTotal = 0;
      rawAsks.forEach((a) => { askTotal += a.size; a.total = askTotal; });

      setBids(rawBids);
      setAsks(rawAsks);
    },
    [levels],
  );

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function load() {
      try {
        setIsLoading(true);
        const book = await api.getL2Book(coin);
        processBook(book.levels);
      } catch (e) {
        console.error("Failed to load order book:", e);
      } finally {
        setIsLoading(false);
      }
    }

    async function connectWs() {
      try {
        await wsClient.connect();
        unsubscribe = subscribeToL2Book(coin, (data) => {
          // Data is already normalized by subscribeToL2Book
          // isSnapshot=true means full book replacement (first message),
          // isSnapshot=false means incremental update.
          // Both go through processBook which sets all levels — correct for
          // Hyperliquid which sends full book state on each update.
          processBook(data.levels);
        });
      } catch (e) {
        console.error("WS order book subscription failed:", e);
      }
    }

    load();
    connectWs();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [coin, processBook]);

  const reversedAsks = useMemo(() => [...asks].reverse(), [asks]);

  const maxTotal = Math.max(
    bids.length > 0 ? bids[bids.length - 1].total : 0,
    asks.length > 0 ? asks[asks.length - 1].total : 0,
    1
  );

  const spread = asks.length > 0 && bids.length > 0
    ? asks[0].price - bids[0].price
    : 0;
  const spreadPct = bids.length > 0 && bids[0].price > 0
    ? (spread / bids[0].price) * 100
    : 0;

  // Determine price formatting from the best bid price
  const priceDecimals = bids.length > 0 ? getPriceDecimals(bids[0].price) : 2;

  if (isLoading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
        <Skeleton className="h-4 w-24 mb-3" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Order Book</span>
        <span className="text-xs text-zinc-500">
          Spread: ${spread.toFixed(priceDecimals)} ({spreadPct.toFixed(3)}%)
        </span>
      </div>

      <div className="px-4 py-2">
        {/* Header */}
        <div className="flex text-xs text-zinc-500 pb-2 border-b border-zinc-800/50">
          <span className="flex-1">Price</span>
          <span className="flex-1 text-right">Size</span>
          <span className="flex-1 text-right">Total</span>
        </div>

        {/* Asks (reversed so lowest ask is at bottom) */}
        <div className="py-1">
          {reversedAsks.map((ask) => (
            <div key={`a-${ask.price}`} className="flex text-xs py-0.5 relative">
              <div
                className="absolute right-0 top-0 bottom-0 bg-red-500/10"
                style={{ width: `${(ask.total / maxTotal) * 100}%` }}
              />
              <span className="flex-1 text-red-400 font-mono relative z-10">{ask.price.toFixed(priceDecimals)}</span>
              <span className="flex-1 text-right text-zinc-300 font-mono relative z-10">{ask.size.toFixed(4)}</span>
              <span className="flex-1 text-right text-zinc-500 font-mono relative z-10">{ask.total.toFixed(4)}</span>
            </div>
          ))}
        </div>

        {/* Spread indicator */}
        <div className="py-1.5 border-y border-zinc-800/50 text-center">
          <span className="text-sm font-mono text-white">
            {bids.length > 0 ? bids[0].price.toFixed(priceDecimals) : "\u2014"}
          </span>
        </div>

        {/* Bids */}
        <div className="py-1">
          {bids.map((bid) => (
            <div key={`b-${bid.price}`} className="flex text-xs py-0.5 relative">
              <div
                className="absolute right-0 top-0 bottom-0 bg-green-500/10"
                style={{ width: `${(bid.total / maxTotal) * 100}%` }}
              />
              <span className="flex-1 text-green-400 font-mono relative z-10">{bid.price.toFixed(priceDecimals)}</span>
              <span className="flex-1 text-right text-zinc-300 font-mono relative z-10">{bid.size.toFixed(4)}</span>
              <span className="flex-1 text-right text-zinc-500 font-mono relative z-10">{bid.total.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
