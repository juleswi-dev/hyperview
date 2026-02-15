"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from "lightweight-charts";
import { api } from "@/lib/hyperliquid/api";
import { wsClient, subscribeToCandle } from "@/lib/hyperliquid/websocket";
import clsx from "clsx";

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];

const INTERVAL_DURATIONS: Record<string, number> = {
  "1m": 6 * 60 * 60 * 1000,
  "5m": 24 * 60 * 60 * 1000,
  "15m": 3 * 24 * 60 * 60 * 1000,
  "1h": 14 * 24 * 60 * 60 * 1000,
  "4h": 30 * 24 * 60 * 60 * 1000,
  "1d": 180 * 24 * 60 * 60 * 1000,
};

interface PriceChartProps {
  coin: string;
}

export function PriceChart({ coin }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [interval, setInterval] = useState("1h");
  const [isLoading, setIsLoading] = useState(true);

  const loadCandles = useCallback(async (iv: string) => {
    setIsLoading(true);
    try {
      const duration = INTERVAL_DURATIONS[iv] || 14 * 24 * 60 * 60 * 1000;
      const startTime = Date.now() - duration;
      const candles = await api.getCandles(coin, iv, startTime);

      if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

      const candleData: CandlestickData[] = candles.map((c) => ({
        time: (c.t / 1000) as Time,
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
      }));

      const volumeData: HistogramData[] = candles.map((c) => {
        const open = parseFloat(c.o);
        const close = parseFloat(c.c);
        // Convert base-asset volume to USD notional using close price
        // so chart volume matches the USD-denominated stats cards
        const volumeUsd = parseFloat(c.v) * close;
        return {
          time: (c.t / 1000) as Time,
          value: volumeUsd,
          color: close >= open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
        };
      });

      candleSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);
      chartRef.current?.timeScale().fitContent();
    } catch (e) {
      console.error("Failed to load candles:", e);
    } finally {
      setIsLoading(false);
    }
  }, [coin]);

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#a1a1aa",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(63,63,70,0.3)" },
        horzLines: { color: "rgba(63,63,70,0.3)" },
      },
      crosshair: {
        vertLine: { color: "rgba(161,161,170,0.3)", labelBackgroundColor: "#27272a" },
        horzLine: { color: "rgba(161,161,170,0.3)", labelBackgroundColor: "#27272a" },
      },
      rightPriceScale: {
        borderColor: "rgba(63,63,70,0.5)",
      },
      timeScale: {
        borderColor: "rgba(63,63,70,0.5)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Load data + subscribe to updates
  useEffect(() => {
    loadCandles(interval);

    let unsubscribe: (() => void) | null = null;

    async function connectWs() {
      try {
        await wsClient.connect();
        unsubscribe = subscribeToCandle(coin, interval, (data) => {
          if (!candleSeriesRef.current || !Array.isArray(data)) return;
          data.forEach((c: { t: number; o: string; h: string; l: string; c: string; v: string }) => {
            const open = parseFloat(c.o);
            const close = parseFloat(c.c);
            candleSeriesRef.current?.update({
              time: (c.t / 1000) as Time,
              open,
              high: parseFloat(c.h),
              low: parseFloat(c.l),
              close,
            });
            volumeSeriesRef.current?.update({
              time: (c.t / 1000) as Time,
              value: parseFloat(c.v) * close,
              color: close >= open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
            });
          });
        });
      } catch (e) {
        console.error("WS candle subscription failed:", e);
      }
    }

    connectWs();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [coin, interval, loadCandles]);

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{coin}/USD</span>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              onClick={() => setInterval(iv.value)}
              className={clsx(
                "px-2.5 py-1 text-xs rounded transition-colors",
                interval === iv.value
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/50">
            <div className="w-6 h-6 border-2 border-zinc-600 border-t-green-500 rounded-full animate-spin" />
          </div>
        )}
        <div ref={containerRef} className="h-[400px]" />
      </div>
    </div>
  );
}
