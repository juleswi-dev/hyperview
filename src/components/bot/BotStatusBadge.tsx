"use client";

import clsx from "clsx";
import type { BotStatus } from "@/types/bot";

const statusConfig: Record<BotStatus, { label: string; color: string; dot: string }> = {
  idle: { label: "Idle", color: "text-zinc-400 bg-zinc-800", dot: "bg-zinc-400" },
  running: { label: "Running", color: "text-green-400 bg-green-900/30", dot: "bg-green-400 animate-pulse" },
  paused: { label: "Paused", color: "text-yellow-400 bg-yellow-900/30", dot: "bg-yellow-400" },
  stopped: { label: "Stopped", color: "text-zinc-400 bg-zinc-800", dot: "bg-zinc-500" },
  error: { label: "Error", color: "text-red-400 bg-red-900/30", dot: "bg-red-400" },
};

export function BotStatusBadge({ status }: { status: BotStatus }) {
  const config = statusConfig[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium", config.color)}>
      <span className={clsx("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
