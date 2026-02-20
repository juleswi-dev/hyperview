import {
  scanForLiquidationFills,
  discoverActiveTraders,
  getRecentTrades,
} from "@/lib/hyperliquid/api";

// ── Types ────────────────────────────────────────────────────

export interface LiquidationSignal {
  coin: string;
  size: number;
  price: number;
  value: number;
  side: "long" | "short";
  method: "market" | "backstop";
  time: number;
  ingestedAt: number;
  hash: string;
  liquidatedUser?: string;
  isConfirmed: boolean;
}

// ── LiquidationFeed ─────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000;
const LARGE_TRADE_POLL_MS = 10_000;
const MAX_SIGNALS = 500;
const MAX_SEEN_HASHES = 2_000;
const LARGE_TRADE_THRESHOLD_USD = 100_000;
const TOP_COINS = ["BTC", "ETH", "SOL", "DOGE", "XRP", "AVAX", "SUI", "LINK", "ARB", "WIF"];

class LiquidationFeedSingleton {
  private consumers = new Set<string>();
  private signals: LiquidationSignal[] = [];
  private seenHashes = new Set<string>();

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private tradeTimer: ReturnType<typeof setInterval> | null = null;
  private pollingConfirmed = false;
  private pollingTrades = false;
  private knownTraders: string[] = [];
  private lastDiscoveryTime = 0;
  private lastPollTime = 0;

  addConsumer(botId: string): void {
    const wasEmpty = this.consumers.size === 0;
    this.consumers.add(botId);
    if (wasEmpty) this.start();
  }

  removeConsumer(botId: string): void {
    this.consumers.delete(botId);
    if (this.consumers.size === 0) this.stop();
  }

  getRecentLiquidations(coin?: string, sinceMs?: number): LiquidationSignal[] {
    let result = this.signals;

    if (coin) {
      result = result.filter((s) => s.coin === coin);
    }

    if (sinceMs) {
      const cutoff = Date.now() - sinceMs;
      // Filter by ingestedAt (when the feed discovered it), not trade time
      result = result.filter((s) => s.ingestedAt >= cutoff);
    }

    return result;
  }

  getConsumerCount(): number {
    return this.consumers.size;
  }

  isRunning(): boolean {
    return this.pollTimer !== null;
  }

  // ── Private ─────────────────────────────────────────────

  private start(): void {
    if (this.pollTimer) return;

    console.log("[LiquidationFeed] Starting (consumers:", this.consumers.size, ")");

    // Initial poll immediately
    void this.pollConfirmedLiquidations();
    void this.pollLargeTradesHeuristic();

    // Set up recurring polls
    this.pollTimer = setInterval(
      () => void this.pollConfirmedLiquidations(),
      POLL_INTERVAL_MS,
    );
    this.tradeTimer = setInterval(
      () => void this.pollLargeTradesHeuristic(),
      LARGE_TRADE_POLL_MS,
    );
  }

  private stop(): void {
    console.log("[LiquidationFeed] Stopping");

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.tradeTimer) {
      clearInterval(this.tradeTimer);
      this.tradeTimer = null;
    }
  }

  private async pollConfirmedLiquidations(): Promise<void> {
    if (this.pollingConfirmed) return;
    this.pollingConfirmed = true;
    try {
      const now = Date.now();

      // Re-discover active traders every 10 minutes
      if (now - this.lastDiscoveryTime > 600_000) {
        this.knownTraders = await discoverActiveTraders(TOP_COINS);
        this.lastDiscoveryTime = now;
        console.log("[LiquidationFeed] Discovered", this.knownTraders.length, "active traders");
      }

      if (this.knownTraders.length === 0) return;

      // Poll for fills with liquidation field since last poll
      const startTime = this.lastPollTime || now - POLL_INTERVAL_MS * 2;
      const fills = await scanForLiquidationFills(this.knownTraders, startTime);
      this.lastPollTime = now;

      for (const fill of fills) {
        if (this.seenHashes.has(fill.hash)) continue;
        this.seenHashes.add(fill.hash);

        const size = Math.abs(parseFloat(fill.sz));
        const price = parseFloat(fill.px);

        // side: A = aggressive sell (seller initiated) = long was liquidated
        //        B = aggressive buy (buyer initiated) = short was liquidated
        const signal: LiquidationSignal = {
          coin: fill.coin,
          size,
          price,
          value: size * price,
          side: fill.side === "A" ? "long" : "short",
          method: fill.liquidation?.method ?? "market",
          time: fill.time,
          ingestedAt: Date.now(),
          hash: fill.hash,
          liquidatedUser: fill.liquidation?.liquidatedUser,
          isConfirmed: true,
        };

        this.addSignal(signal);
      }
    } catch (error) {
      console.error("[LiquidationFeed] Poll error:", error);
    } finally {
      this.pollingConfirmed = false;
    }
  }

  private async pollLargeTradesHeuristic(): Promise<void> {
    if (this.pollingTrades) return;
    this.pollingTrades = true;
    try {
      // Check recent trades on top coins for large orders (potential market liquidations)
      for (const coin of TOP_COINS.slice(0, 5)) {
        const trades = await getRecentTrades(coin);
        if (!Array.isArray(trades)) continue;

        for (const trade of trades) {
          const hash = trade.hash;
          if (this.seenHashes.has(hash)) continue;

          const size = parseFloat(trade.sz);
          const price = parseFloat(trade.px);
          const value = size * price;

          if (value < LARGE_TRADE_THRESHOLD_USD) continue;

          this.seenHashes.add(hash);

          const signal: LiquidationSignal = {
            coin: trade.coin,
            size,
            price,
            value,
            side: trade.side === "A" ? "long" : "short",
            method: "market",
            time: trade.time,
            ingestedAt: Date.now(),
            hash,
            isConfirmed: false,
          };

          this.addSignal(signal);
        }
      }
    } catch (error) {
      console.error("[LiquidationFeed] Trade heuristic error:", error);
    } finally {
      this.pollingTrades = false;
    }
  }

  private addSignal(signal: LiquidationSignal): void {
    this.signals.unshift(signal);

    // Trim signals to max size
    if (this.signals.length > MAX_SIGNALS) {
      const removed = this.signals.splice(MAX_SIGNALS);
      for (const r of removed) {
        this.seenHashes.delete(r.hash);
      }
    }

    // Safety cap on seenHashes to prevent unbounded growth
    if (this.seenHashes.size > MAX_SEEN_HASHES) {
      const activeHashes = new Set(this.signals.map((s) => s.hash));
      this.seenHashes = activeHashes;
    }
  }
}

// Singleton via globalThis (survives Next.js HMR)
const g = globalThis as unknown as { _liquidationFeed?: LiquidationFeedSingleton };
export const liquidationFeed = g._liquidationFeed ?? (g._liquidationFeed = new LiquidationFeedSingleton());
