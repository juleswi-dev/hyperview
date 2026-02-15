import { create } from "zustand";
import type { Fill, Liquidation } from "@/types/hyperliquid";

// Per-coin thresholds for large trade heuristic.
// BTC/ETH have much higher routine order sizes, so require higher thresholds
// to reduce false positives. Other coins use a lower default.
const LARGE_TRADE_THRESHOLDS: Record<string, number> = {
  BTC: 200_000,
  ETH: 150_000,
  SOL: 100_000,
};
const DEFAULT_LARGE_TRADE_THRESHOLD = 50_000;

function getLargeTradeThreshold(coin: string): number {
  return LARGE_TRADE_THRESHOLDS[coin] ?? DEFAULT_LARGE_TRADE_THRESHOLD;
}

interface LiquidationState {
  liquidations: Liquidation[];
  largeTrades: Liquidation[];
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  /** Timestamp of the most recent processed fill, used for gap-fill after reconnect */
  lastFillTime: number;

  // Actions
  processFills: (fills: Fill[]) => void;
  processLargeTrades: (
    trades: Array<{
      coin: string;
      side: string;
      px: string;
      sz: string;
      time: number;
      hash?: string;
    }>,
  ) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnected: (connected: boolean) => void;
}

export const useLiquidationStore = create<LiquidationState>((set, get) => ({
  liquidations: [],
  largeTrades: [],
  isLoading: true,
  error: null,
  isConnected: false,
  lastFillTime: 0,

  processFills: (fills) => {
    const newLiqs: Liquidation[] = [];
    let maxTime = get().lastFillTime;

    for (const fill of fills) {
      if (fill.liquidation || fill.liquidationMarkPx) {
        // NOTE on float precision: parseFloat introduces IEEE 754 rounding.
        // For display-only aggregation this is acceptable (~0.01% drift at worst).
        // If PnL accounting is added, switch to a decimal library.
        const size = Math.abs(parseFloat(fill.sz));
        const price = parseFloat(fill.px);
        newLiqs.push({
          coin: fill.coin,
          size,
          price,
          value: size * price,
          // Side mapping (HLP perspective):
          // B = HLP bought = took the other side = LONG position was liquidated
          // A = HLP sold   = took the other side = SHORT position was liquidated
          side: fill.side === "B" ? "long" : "short",
          method: fill.liquidation?.method || "backstop",
          time: fill.time,
          hash: fill.hash,
          liquidatedUser: fill.liquidation?.liquidatedUser,
        });
      }
      if (fill.time > maxTime) maxTime = fill.time;
    }

    if (newLiqs.length > 0 || maxTime > get().lastFillTime) {
      set((state) => {
        const combined = [...newLiqs, ...state.liquidations];
        const seen = new Set<string>();
        const unique = combined.filter((l) => {
          if (seen.has(l.hash)) return false;
          seen.add(l.hash);
          return true;
        });
        return {
          liquidations: unique.sort((a, b) => b.time - a.time).slice(0, 500),
          lastFillTime: Math.max(state.lastFillTime, maxTime),
        };
      });
    }
  },

  processLargeTrades: (trades) => {
    const newLarge: Liquidation[] = [];

    for (const trade of trades) {
      const size = parseFloat(trade.sz);
      const price = parseFloat(trade.px);
      const value = size * price;
      const threshold = getLargeTradeThreshold(trade.coin);

      if (value >= threshold) {
        newLarge.push({
          coin: trade.coin,
          size,
          price,
          value,
          // Side mapping (trade taker perspective):
          // A = aggressive SELL = someone's LONG was force-closed (liquidated)
          // B = aggressive BUY  = someone's SHORT was force-closed (liquidated)
          // Note: this is a heuristic — large market orders are not always liquidations.
          side: trade.side === "A" ? "long" : "short",
          method: "market",
          time: trade.time,
          hash: trade.hash || `${trade.time}-${trade.coin}-${trade.sz}`,
        });
      }
    }

    if (newLarge.length > 0) {
      set((state) => {
        const combined = [...newLarge, ...state.largeTrades];
        const seen = new Set<string>();
        const unique = combined.filter((l) => {
          if (seen.has(l.hash)) return false;
          seen.add(l.hash);
          return true;
        });
        return {
          largeTrades: unique.sort((a, b) => b.time - a.time).slice(0, 200),
        };
      });
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setConnected: (isConnected) => set({ isConnected }),
}));

// Derived selectors — accept only the data they need, not the full state,
// so callers can pass stable references from individual Zustand selectors.
export function selectStats(liquidations: Liquidation[], now: number) {
  const cutoff24h = now - 86_400_000;
  const cutoff4h = now - 14_400_000;
  const cutoff1h = now - 3_600_000;

  // Filter to 24h window first — liquidations older than 24h are not counted
  const last24h = liquidations.filter((l) => l.time > cutoff24h);
  const last4h = last24h.filter((l) => l.time > cutoff4h);
  const last1h = last24h.filter((l) => l.time > cutoff1h);

  return {
    count1h: last1h.length,
    count4h: last4h.length,
    count24h: last24h.length,
    volume1h: last1h.reduce((s, l) => s + l.value, 0),
    volume4h: last4h.reduce((s, l) => s + l.value, 0),
    volume24h: last24h.reduce((s, l) => s + l.value, 0),
    longVolume24h: last24h
      .filter((l) => l.side === "long")
      .reduce((s, l) => s + l.value, 0),
    shortVolume24h: last24h
      .filter((l) => l.side === "short")
      .reduce((s, l) => s + l.value, 0),
    largestLiq:
      last24h.length > 0
        ? last24h.reduce((max, l) => (l.value > max.value ? l : max), last24h[0])
        : null,
  };
}

export function selectAllActivity(liquidations: Liquidation[], largeTrades: Liquidation[]) {
  const combined = [
    ...liquidations.map((l) => ({ ...l, isConfirmed: true as const })),
    ...largeTrades.map((l) => ({ ...l, isConfirmed: false as const })),
  ];
  return combined.sort((a, b) => b.time - a.time).slice(0, 100);
}
