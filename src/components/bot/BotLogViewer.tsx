"use client";

import { useRef, useEffect } from "react";
import clsx from "clsx";
import type { BotLogEntry } from "@/types/bot";

interface BotLogViewerProps {
  logs: BotLogEntry[];
}

const levelColors = {
  info: "text-zinc-300",
  warn: "text-yellow-400",
  error: "text-red-400",
};

export function BotLogViewer({ logs }: BotLogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No logs yet
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-zinc-950 rounded-lg border border-zinc-800 p-3 max-h-96 overflow-y-auto font-mono text-xs space-y-0.5"
    >
      {logs.map((log) => (
        <div key={log.id} className="flex gap-2">
          <span className="text-zinc-600 shrink-0">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className={clsx("shrink-0 w-12", levelColors[log.level])}>
            [{log.level.toUpperCase()}]
          </span>
          <span className={clsx(levelColors[log.level])}>{log.message}</span>
        </div>
      ))}
    </div>
  );
}
