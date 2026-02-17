import { create } from "zustand";
import type { BotConfig, TradeRecord, BotLogEntry } from "@/types/bot";

interface BotState {
  bots: BotConfig[];
  isLoading: boolean;
  error: string | null;

  // Selected bot detail
  selectedBot: BotConfig | null;
  selectedBotTrades: TradeRecord[];
  selectedBotLogs: BotLogEntry[];

  // Actions
  setBots: (bots: BotConfig[]) => void;
  setSelectedBot: (bot: BotConfig | null) => void;
  setSelectedBotTrades: (trades: TradeRecord[]) => void;
  setSelectedBotLogs: (logs: BotLogEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateBotInList: (bot: BotConfig) => void;
  removeBotFromList: (id: string) => void;
}

export const useBotStore = create<BotState>((set) => ({
  bots: [],
  isLoading: false,
  error: null,
  selectedBot: null,
  selectedBotTrades: [],
  selectedBotLogs: [],

  setBots: (bots) => set({ bots, isLoading: false }),
  setSelectedBot: (selectedBot) => set({ selectedBot }),
  setSelectedBotTrades: (selectedBotTrades) => set({ selectedBotTrades }),
  setSelectedBotLogs: (selectedBotLogs) => set({ selectedBotLogs }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  updateBotInList: (bot) =>
    set((state) => ({
      bots: state.bots.map((b) => (b.id === bot.id ? bot : b)),
      selectedBot: state.selectedBot?.id === bot.id ? bot : state.selectedBot,
    })),
  removeBotFromList: (id) =>
    set((state) => ({
      bots: state.bots.filter((b) => b.id !== id),
      selectedBot: state.selectedBot?.id === id ? null : state.selectedBot,
    })),
}));
