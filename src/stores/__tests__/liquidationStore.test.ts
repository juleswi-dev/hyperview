import { describe, it, expect, beforeEach } from "vitest";
import {
  useLiquidationStore,
  selectStats,
  selectAllActivity,
} from "@/stores/liquidationStore";
import type { Fill } from "@/types/hyperliquid";

beforeEach(() => {
  useLiquidationStore.setState({
    liquidations: [],
    largeTrades: [],
    isLoading: true,
    error: null,
    isConnected: false,
    lastFillTime: 0,
  });
});

const makeFill = (overrides: Partial<Fill> = {}): Fill => ({
  coin: "BTC",
  px: "60000",
  sz: "1.0",
  side: "B",
  time: Date.now(),
  hash: `hash-${Math.random()}`,
  oid: 1,
  tid: 1,
  fee: "0.01",
  dir: "",
  closedPnl: "0",
  liquidation: {
    liquidatedUser: "0xabc",
    markPx: "59000",
    method: "backstop",
  },
  ...overrides,
});

describe("liquidationStore", () => {
  describe("processFills", () => {
    it("extracts liquidations from fills", () => {
      const store = useLiquidationStore.getState();
      store.processFills([makeFill({ hash: "h1" })]);
      const { liquidations } = useLiquidationStore.getState();
      expect(liquidations).toHaveLength(1);
      expect(liquidations[0].coin).toBe("BTC");
      expect(liquidations[0].value).toBe(60000);
      expect(liquidations[0].side).toBe("long"); // B = HLP bought = long liquidated
    });

    it("ignores fills without liquidation field", () => {
      const store = useLiquidationStore.getState();
      const fill = makeFill();
      delete fill.liquidation;
      delete fill.liquidationMarkPx;
      store.processFills([fill]);
      expect(useLiquidationStore.getState().liquidations).toHaveLength(0);
    });

    it("deduplicates by hash", () => {
      const store = useLiquidationStore.getState();
      const fill = makeFill({ hash: "dup" });
      store.processFills([fill]);
      store.processFills([fill]);
      expect(useLiquidationStore.getState().liquidations).toHaveLength(1);
    });

    it("tracks lastFillTime", () => {
      const store = useLiquidationStore.getState();
      const time = Date.now();
      store.processFills([makeFill({ hash: "t1", time })]);
      expect(useLiquidationStore.getState().lastFillTime).toBe(time);
    });
  });

  describe("processLargeTrades", () => {
    it("captures trades above default threshold ($50K)", () => {
      const store = useLiquidationStore.getState();
      store.processLargeTrades([
        { coin: "DOGE", side: "A", px: "0.10", sz: "600000", time: Date.now(), hash: "t1" },
      ]);
      const { largeTrades } = useLiquidationStore.getState();
      expect(largeTrades).toHaveLength(1);
      expect(largeTrades[0].value).toBe(60000);
      expect(largeTrades[0].side).toBe("long"); // A = aggressive sell = long liquidated
    });

    it("uses higher threshold for BTC ($200K)", () => {
      const store = useLiquidationStore.getState();
      // $150K BTC trade — under BTC threshold of $200K
      store.processLargeTrades([
        { coin: "BTC", side: "A", px: "75000", sz: "2", time: Date.now(), hash: "t2" },
      ]);
      expect(useLiquidationStore.getState().largeTrades).toHaveLength(0);

      // $225K BTC trade — above BTC threshold
      store.processLargeTrades([
        { coin: "BTC", side: "A", px: "75000", sz: "3", time: Date.now(), hash: "t3" },
      ]);
      expect(useLiquidationStore.getState().largeTrades).toHaveLength(1);
    });

    it("ignores trades below threshold", () => {
      const store = useLiquidationStore.getState();
      store.processLargeTrades([
        { coin: "ETH", side: "A", px: "3000", sz: "1", time: Date.now() },
      ]);
      expect(useLiquidationStore.getState().largeTrades).toHaveLength(0);
    });
  });

  describe("selectStats", () => {
    it("computes stats from liquidations within 24h window", () => {
      const now = Date.now();
      const store = useLiquidationStore.getState();
      store.processFills([
        makeFill({ hash: "a", time: now - 30 * 60 * 1000, px: "60000", sz: "1" }), // 30min ago
        makeFill({ hash: "b", time: now - 2 * 3600 * 1000, px: "50000", sz: "0.5", side: "A" }), // 2h ago, short
      ]);

      const state = useLiquidationStore.getState();
      const stats = selectStats(state.liquidations, now);

      expect(stats.count1h).toBe(1);
      expect(stats.count4h).toBe(2);
      expect(stats.count24h).toBe(2);
      expect(stats.volume1h).toBe(60000);
      expect(stats.longVolume24h).toBe(60000);
      expect(stats.shortVolume24h).toBe(25000);
      expect(stats.largestLiq?.hash).toBe("a");
    });

    it("excludes liquidations older than 24h", () => {
      const now = Date.now();
      const store = useLiquidationStore.getState();
      store.processFills([
        makeFill({ hash: "old", time: now - 25 * 3600 * 1000, px: "60000", sz: "1" }), // 25h ago
        makeFill({ hash: "new", time: now - 1 * 3600 * 1000, px: "50000", sz: "0.5" }), // 1h ago
      ]);

      const state = useLiquidationStore.getState();
      const stats = selectStats(state.liquidations, now);

      expect(stats.count24h).toBe(1); // only the "new" one
      expect(stats.volume24h).toBe(25000);
    });
  });

  describe("selectAllActivity", () => {
    it("combines and sorts liquidations and large trades", () => {
      const now = Date.now();
      const store = useLiquidationStore.getState();
      store.processFills([makeFill({ hash: "l1", time: now - 1000 })]);
      store.processLargeTrades([
        { coin: "SOL", side: "B", px: "100", sz: "1100", time: now - 500, hash: "t1" },
      ]);

      const state = useLiquidationStore.getState();
      const activity = selectAllActivity(state.liquidations, state.largeTrades);

      expect(activity).toHaveLength(2);
      expect(activity[0].hash).toBe("t1"); // more recent
      expect(activity[0].isConfirmed).toBe(false);
      expect(activity[1].hash).toBe("l1");
      expect(activity[1].isConfirmed).toBe(true);
    });
  });
});
