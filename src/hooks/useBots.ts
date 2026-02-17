"use client";

import { useEffect, useCallback } from "react";
import { useBotStore } from "@/stores/botStore";
import type { BotConfig, CreateBotRequest } from "@/types/bot";

export function useBots() {
  const { bots, isLoading, error, setBots, setLoading, setError, updateBotInList, removeBotFromList } =
    useBotStore();

  const fetchBots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bot");
      if (!res.ok) throw new Error("Failed to fetch bots");
      const data: BotConfig[] = await res.json();
      setBots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch bots");
      setLoading(false);
    }
  }, [setBots, setLoading, setError]);

  useEffect(() => {
    fetchBots();
    // Poll every 5 seconds for status updates
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  }, [fetchBots]);

  const createBot = async (req: CreateBotRequest): Promise<BotConfig> => {
    const res = await fetch("/api/bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to create bot");
    }
    const bot: BotConfig = await res.json();
    await fetchBots();
    return bot;
  };

  const startBot = async (id: string): Promise<void> => {
    const res = await fetch(`/api/bot/${id}/start`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to start bot");
    }
    await fetchBots();
  };

  const stopBot = async (id: string): Promise<void> => {
    const res = await fetch(`/api/bot/${id}/stop`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to stop bot");
    }
    await fetchBots();
  };

  const deleteBot = async (id: string): Promise<void> => {
    const res = await fetch(`/api/bot/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to delete bot");
    }
    removeBotFromList(id);
  };

  return {
    bots,
    isLoading,
    error,
    fetchBots,
    createBot,
    startBot,
    stopBot,
    deleteBot,
    updateBotInList,
  };
}
