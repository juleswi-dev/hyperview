"use client";

import Link from "next/link";
import type { BotConfig } from "@/types/bot";
import { BotStatusBadge } from "./BotStatusBadge";

interface BotCardProps {
  bot: BotConfig;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}

export function BotCard({ bot, onStart, onStop, onDelete }: BotCardProps) {
  const isRunning = bot.status === "running";

  return (
    <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-xl border border-zinc-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link href={`/bot/${bot.id}`} className="text-lg font-semibold text-white hover:text-blue-400 transition-colors">
            {bot.name}
          </Link>
          <p className="text-sm text-zinc-400 mt-0.5">{bot.strategyId.toUpperCase()} - {bot.coins.join(", ")}</p>
        </div>
        <BotStatusBadge status={bot.status} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
        <div>
          <span className="text-zinc-500">Mode</span>
          <p className="text-white capitalize">{bot.mode}</p>
        </div>
        <div>
          <span className="text-zinc-500">Interval</span>
          <p className="text-white">{(bot.tickIntervalMs / 1000).toFixed(0)}s</p>
        </div>
        <div>
          <span className="text-zinc-500">Peak Equity</span>
          <p className="text-white">${bot.peakEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      {bot.lastError && (
        <p className="text-xs text-red-400 mb-3 truncate" title={bot.lastError}>
          {bot.lastError}
        </p>
      )}

      <div className="flex gap-2">
        {isRunning ? (
          <button
            onClick={() => onStop(bot.id)}
            className="flex-1 px-3 py-1.5 text-sm bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => onStart(bot.id)}
            className="flex-1 px-3 py-1.5 text-sm bg-green-900/30 text-green-400 rounded-lg hover:bg-green-900/50 transition-colors"
          >
            Start
          </button>
        )}
        <Link
          href={`/bot/${bot.id}`}
          className="px-3 py-1.5 text-sm bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600 transition-colors"
        >
          Details
        </Link>
        {!isRunning && (
          <button
            onClick={() => onDelete(bot.id)}
            className="px-3 py-1.5 text-sm bg-zinc-800 text-zinc-500 rounded-lg hover:bg-red-900/30 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
