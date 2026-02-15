import { create } from "zustand";
import type { Asset, AssetMeta, AssetCtx } from "@/types/hyperliquid";

interface MarketState {
  assets: Asset[];
  mids: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;

  // Actions
  setAssets: (meta: AssetMeta[], ctxs: AssetCtx[]) => void;
  setMids: (mids: Record<string, string>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnected: (connected: boolean) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  assets: [],
  mids: {},
  isLoading: true,
  error: null,
  isConnected: false,

  setAssets: (meta, ctxs) =>
    set({
      assets: meta.map((m, i) => ({ meta: m, ctx: ctxs[i], index: i })),
      error: null,
    }),

  setMids: (mids) => set({ mids }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setConnected: (isConnected) => set({ isConnected }),
}));

// Derived selectors (outside store to avoid re-creating on every call)
export function selectAssetsWithPrices(state: MarketState) {
  return state.assets.map((asset) => ({
    ...asset,
    midPrice: state.mids[asset.meta.name] || asset.ctx.markPx,
  }));
}

export function getChange24h(
  asset: Asset,
  mids: Record<string, string>,
): number {
  const currentPrice = parseFloat(mids[asset.meta.name] || asset.ctx.markPx);
  const prevPrice = parseFloat(asset.ctx.prevDayPx);
  if (!prevPrice) return 0;
  return ((currentPrice - prevPrice) / prevPrice) * 100;
}
