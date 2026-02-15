import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearCache } from "@/lib/cache";

beforeEach(() => {
  clearCache();
  vi.restoreAllMocks();
});

describe("api", () => {
  it("getMetaAndAssetCtxs sends correct payload", async () => {
    const mockResponse = [
      { universe: [{ name: "BTC", szDecimals: 3, maxLeverage: 50 }] },
      [{ funding: "0.0001", openInterest: "1000", prevDayPx: "60000", dayNtlVlm: "500000", premium: "0", oraclePx: "61000", markPx: "61000" }],
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { getMetaAndAssetCtxs } = await import("@/lib/hyperliquid/api");
    const result = await getMetaAndAssetCtxs();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.hyperliquid.xyz/info",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it("throws on non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const { getAllMids } = await import("@/lib/hyperliquid/api");
    await expect(getAllMids()).rejects.toThrow("API error: 429");
  });
});
