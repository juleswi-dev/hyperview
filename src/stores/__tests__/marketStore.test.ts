import { describe, it, expect, beforeEach } from "vitest";
import { useMarketStore, getChange24h } from "@/stores/marketStore";
import type { AssetMeta, AssetCtx, Asset } from "@/types/hyperliquid";

beforeEach(() => {
  useMarketStore.setState({
    assets: [],
    mids: {},
    isLoading: true,
    error: null,
    isConnected: false,
  });
});

const mockMeta: AssetMeta[] = [
  { name: "BTC", szDecimals: 3, maxLeverage: 50 },
  { name: "ETH", szDecimals: 4, maxLeverage: 50 },
];

const mockCtxs: AssetCtx[] = [
  { funding: "0.0001", openInterest: "1000", prevDayPx: "60000", dayNtlVlm: "500000000", premium: "0", oraclePx: "61000", markPx: "61500" },
  { funding: "-0.0002", openInterest: "5000", prevDayPx: "3000", dayNtlVlm: "200000000", premium: "0", oraclePx: "3100", markPx: "3100" },
];

describe("marketStore", () => {
  it("setAssets creates combined assets", () => {
    useMarketStore.getState().setAssets(mockMeta, mockCtxs);
    const { assets } = useMarketStore.getState();
    expect(assets).toHaveLength(2);
    expect(assets[0].meta.name).toBe("BTC");
    expect(assets[0].ctx.markPx).toBe("61500");
    expect(assets[0].index).toBe(0);
  });

  it("setMids updates mids", () => {
    useMarketStore.getState().setMids({ BTC: "62000", ETH: "3200" });
    expect(useMarketStore.getState().mids).toEqual({ BTC: "62000", ETH: "3200" });
  });

  it("setError sets error and setAssets clears it", () => {
    useMarketStore.getState().setError("oops");
    expect(useMarketStore.getState().error).toBe("oops");
    useMarketStore.getState().setAssets(mockMeta, mockCtxs);
    expect(useMarketStore.getState().error).toBeNull();
  });
});

describe("getChange24h", () => {
  it("calculates change from prevDayPx to mid price", () => {
    const asset: Asset = { meta: mockMeta[0], ctx: mockCtxs[0], index: 0 };
    const mids = { BTC: "63000" };
    const change = getChange24h(asset, mids);
    // (63000 - 60000) / 60000 * 100 = 5%
    expect(change).toBeCloseTo(5.0, 1);
  });

  it("falls back to markPx when no mid", () => {
    const asset: Asset = { meta: mockMeta[0], ctx: mockCtxs[0], index: 0 };
    const change = getChange24h(asset, {});
    // (61500 - 60000) / 60000 * 100 = 2.5%
    expect(change).toBeCloseTo(2.5, 1);
  });

  it("returns 0 when prevDayPx is 0", () => {
    const asset: Asset = {
      meta: mockMeta[0],
      ctx: { ...mockCtxs[0], prevDayPx: "0" },
      index: 0,
    };
    expect(getChange24h(asset, {})).toBe(0);
  });
});
