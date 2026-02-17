"use client";

import { useEffect, useCallback } from "react";
import { useBotStore } from "@/stores/botStore";
import type { BotConfig, TradeRecord, BotLogEntry } from "@/types/bot";

export function useBotDetail(botId: string) {
  const {
    selectedBot,
    selectedBotTrades,
    selectedBotLogs,
    setSelectedBot,
    setSelectedBotTrades,
    setSelectedBotLogs,
  } = useBotStore();

  const fetchBot = useCallback(async () => {
    try {
      const res = await fetch(`/api/bot/${botId}`);
      if (!res.ok) return;
      const bot: BotConfig = await res.json();
      setSelectedBot(bot);
    } catch {
      // Silently fail for polling
    }
  }, [botId, setSelectedBot]);

  const fetchTrades = useCallback(async (limit = 100, offset = 0) => {
    try {
      const res = await fetch(`/api/bot/${botId}/trades?limit=${limit}&offset=${offset}`);
      if (!res.ok) return;
      const data: { trades: TradeRecord[] } = await res.json();
      setSelectedBotTrades(data.trades);
    } catch {
      // Silently fail
    }
  }, [botId, setSelectedBotTrades]);

  const fetchLogs = useCallback(async (limit = 100, offset = 0) => {
    try {
      const res = await fetch(`/api/bot/${botId}/logs?limit=${limit}&offset=${offset}`);
      if (!res.ok) return;
      const data: { logs: BotLogEntry[] } = await res.json();
      setSelectedBotLogs(data.logs);
    } catch {
      // Silently fail
    }
  }, [botId, setSelectedBotLogs]);

  useEffect(() => {
    fetchBot();
    fetchTrades();
    fetchLogs();

    // Poll for updates
    const interval = setInterval(() => {
      fetchBot();
      fetchTrades();
      fetchLogs();
    }, 5000);

    return () => {
      clearInterval(interval);
      setSelectedBot(null);
    };
  }, [fetchBot, fetchTrades, fetchLogs, setSelectedBot]);

  return {
    bot: selectedBot,
    trades: selectedBotTrades,
    logs: selectedBotLogs,
    refresh: () => {
      fetchBot();
      fetchTrades();
      fetchLogs();
    },
  };
}
