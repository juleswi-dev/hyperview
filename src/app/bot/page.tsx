"use client";

import Link from "next/link";
import { useBots } from "@/hooks/useBots";
import { BotCard } from "@/components/bot/BotCard";

export default function BotDashboard() {
  const { bots, isLoading, error, startBot, stopBot, deleteBot } = useBots();

  const handleStart = async (id: string) => {
    try {
      await startBot(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start bot");
    }
  };

  const handleStop = async (id: string) => {
    try {
      await stopBot(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to stop bot");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bot? Trade history will be lost.")) return;
    try {
      await deleteBot(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete bot");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Bots</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {bots.filter((b) => b.status === "running").length} running / {bots.length} total
          </p>
        </div>
        <Link
          href="/bot/create"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
        >
          + New Bot
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading && bots.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : bots.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-400 mb-4">No bots yet. Create your first trading bot.</p>
          <Link
            href="/bot/create"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            Create Bot
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              onStart={handleStart}
              onStop={handleStop}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
