import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCached, setCache, cachedFetch, clearCache } from "@/lib/cache";

beforeEach(() => {
  clearCache();
});

describe("cache", () => {
  describe("get/set", () => {
    it("returns null for missing key", () => {
      expect(getCached("nope")).toBeNull();
    });

    it("returns cached data within TTL", () => {
      setCache("key", { a: 1 }, 10_000);
      expect(getCached("key")).toEqual({ a: 1 });
    });

    it("returns null after TTL expires", () => {
      vi.useFakeTimers();
      setCache("key", "value", 100);
      vi.advanceTimersByTime(200);
      expect(getCached("key")).toBeNull();
      vi.useRealTimers();
    });
  });

  describe("cachedFetch", () => {
    it("calls fetcher on first request", async () => {
      const fetcher = vi.fn().mockResolvedValue("data");
      const result = await cachedFetch("k", fetcher, 5000);
      expect(result).toBe("data");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("returns cached value on second request", async () => {
      const fetcher = vi.fn().mockResolvedValue("data");
      await cachedFetch("k", fetcher, 5000);
      const result2 = await cachedFetch("k", fetcher, 5000);
      expect(result2).toBe("data");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("deduplicates concurrent requests", async () => {
      let resolvePromise: (v: string) => void;
      const fetcher = vi.fn().mockImplementation(
        () => new Promise<string>((r) => { resolvePromise = r; }),
      );

      const p1 = cachedFetch("k", fetcher, 5000);
      const p2 = cachedFetch("k", fetcher, 5000);

      resolvePromise!("result");

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe("result");
      expect(r2).toBe("result");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("propagates errors and allows retry", async () => {
      const fetcher = vi.fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("ok");

      await expect(cachedFetch("k", fetcher, 5000)).rejects.toThrow("fail");
      const result = await cachedFetch("k", fetcher, 5000);
      expect(result).toBe("ok");
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});
