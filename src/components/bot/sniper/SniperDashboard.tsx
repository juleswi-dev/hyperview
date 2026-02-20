"use client";

import { useMemo } from "react";
import type { BotConfig, TradeRecord, BotLogEntry } from "@/types/bot";
import { useSniperSignals } from "@/hooks/useSniperSignals";
import { useMarketData } from "@/hooks/useMarketData";
import { SniperStats } from "./SniperStats";
import { SignalFeed } from "./SignalFeed";
import { ActivePositionCard } from "./ActivePositionCard";
import { PnLChart } from "@/components/bot/PnLChart";
import { TradeHistoryTable } from "@/components/bot/TradeHistoryTable";
import { BotLogViewer } from "@/components/bot/BotLogViewer";

interface SniperDashboardProps {
  bot: BotConfig;
  trades: TradeRecord[];
  logs: BotLogEntry[];
}

interface ActivePosition {
  coin: string;
  side: "buy" | "sell";
  entryPrice: number;
  size: number;
  orderId: string;
  enteredAt: number;
  filled: boolean;
  signalHash: string;
  signalValue: number;
}

export function SniperDashboard({ bot, trades, logs }: SniperDashboardProps) {
  const { signals, stats } = useSniperSignals(bot.id);
  const { mids } = useMarketData();

  // Extract active positions from strategy state
  const activePositions: ActivePosition[] = useMemo(() => {
    return ((bot.strategyState?.activePositions as ActivePosition[]) ?? []);
  }, [bot.strategyState]);

  // Build set of triggered signal hashes
  const triggeredHashes = useMemo(() => {
    const set = new Set<string>();
    for (const pos of activePositions) {
      if (pos.signalHash) set.add(pos.signalHash);
    }
    return set;
  }, [activePositions]);

  // Compute trade stats (realized + unrealized)
  const realizedPnl = trades.reduce((sum, t) => sum + t.pnl - t.fee, 0);
  const unrealizedPnl = useMemo(() => {
    let total = 0;
    for (const pos of activePositions) {
      if (!pos.filled) continue;
      const liveMid = mids[pos.coin];
      const current = liveMid ? parseFloat(liveMid) : pos.entryPrice;
      const pnl = pos.side === "buy"
        ? (current - pos.entryPrice) * pos.size
        : (pos.entryPrice - current) * pos.size;
      total += pnl;
    }
    return total;
  }, [activePositions, mids]);
  const totalPnl = realizedPnl + unrealizedPnl;
  const winningTrades = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  const sniperConfig = bot.strategyConfig as { takeProfitPercent?: number; stopLossPercent?: number };
  const tpPercent = sniperConfig.takeProfitPercent ?? 2;
  const slPercent = sniperConfig.stopLossPercent ?? 1;

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800/30 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-2">
          {bot.status === "running" ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-sm text-green-400 font-medium">Scanning</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
              <span className="text-sm text-zinc-500 font-medium">Inactive</span>
            </>
          )}
        </div>
        <div className="h-4 w-px bg-zinc-700" />
        <span className="text-xs text-zinc-500">
          Feed: {stats.feedRunning ? (
            <span className="text-green-400">connected</span>
          ) : (
            <span className="text-zinc-500">offline</span>
          )}
        </span>
        <span className="text-xs text-zinc-500">
          Consumers: {stats.consumerCount}
        </span>
      </div>

      {/* Stats Row */}
      <SniperStats
        signalsDetected={stats.totalDetected}
        tradesTriggered={stats.totalActedOn}
        hitRate={winRate}
        netPnl={totalPnl}
        unrealizedPnl={unrealizedPnl}
        activePositions={activePositions.length}
      />

      {/* Main Content: Signal Feed + Active Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Signal Feed (2/3) */}
        <div className="lg:col-span-2 bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Liquidation Signals</h2>
          <SignalFeed signals={signals} triggeredHashes={triggeredHashes} />
        </div>

        {/* Active Positions (1/3) */}
        <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            Active Positions ({activePositions.length})
          </h2>
          {activePositions.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-zinc-500 text-sm">
              No open positions
            </div>
          ) : (
            <div className="space-y-3">
              {activePositions.map((pos) => {
                const liveMid = mids[pos.coin];
                const currentPrice = liveMid ? parseFloat(liveMid) : pos.entryPrice;
                return (
                  <ActivePositionCard
                    key={pos.orderId}
                    position={pos}
                    currentPrice={currentPrice}
                    takeProfitPercent={tpPercent}
                    stopLossPercent={slPercent}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PnL Chart + Trade History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Cumulative PnL</h2>
          <PnLChart trades={trades} unrealizedPnl={unrealizedPnl} />
        </div>
        <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Trade History</h2>
          <TradeHistoryTable trades={trades} />
        </div>
      </div>

      {/* Logs */}
      <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Logs</h2>
        <BotLogViewer logs={logs} />
      </div>
    </div>
  );
}
