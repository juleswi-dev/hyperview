import type { WsSubscription } from "@/types/hyperliquid";

type MessageHandler = (data: unknown, isSnapshot: boolean) => void;
type ConnectionHandler = (connected: boolean) => void;

interface Subscription {
  subscription: WsSubscription;
  handler: MessageHandler;
}

class HyperliquidWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnects = 10;
  private reconnectDelay = 1000;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionListeners: Set<ConnectionHandler> = new Set();

  private getSubscriptionKey(sub: WsSubscription): string {
    return JSON.stringify(sub);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionListeners.add(handler);
    return () => { this.connectionListeners.delete(handler); };
  }

  private notifyConnectionChange(connected: boolean) {
    this.connectionListeners.forEach((h) => h(connected));
  }

  connect(): Promise<void> {
    // Already open
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // Connection already in progress — return the same promise
    if (this.connectPromise) {
      return this.connectPromise;
    }

    // Reset reconnect counter on explicit connect() call
    this.reconnectAttempts = 0;

    // Cancel any pending reconnect timer to prevent it from
    // overwriting this new connection attempt
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.connectPromise = this.createConnection();
    return this.connectPromise;
  }

  private createConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Close stale socket before creating new one
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;
        if (this.ws.readyState !== WebSocket.CLOSED) {
          this.ws.close();
        }
        this.ws = null;
      }

      let settled = false;

      try {
        this.ws = new WebSocket("wss://api.hyperliquid.xyz/ws");

        this.ws.onopen = () => {
          console.log("[WS] Connected to Hyperliquid");
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.notifyConnectionChange(true);

          // Resubscribe to all active subscriptions
          this.subscriptions.forEach((sub) => {
            this.send({
              method: "subscribe",
              subscription: sub.subscription,
            });
          });

          if (!settled) {
            settled = true;
            resolve();
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.channel === "subscriptionResponse") {
              return;
            }

            const channelType = msg.channel;
            // The first message after subscribe has isSnapshot: true
            const isSnapshot = msg.data?.isSnapshot === true;

            this.subscriptions.forEach((sub) => {
              if (this.matchesSubscription(channelType, sub.subscription, msg)) {
                sub.handler(msg.data, isSnapshot);
              }
            });
          } catch (e) {
            console.error("[WS] Error parsing message:", e);
          }
        };

        this.ws.onclose = () => {
          console.log("[WS] Connection closed");
          this.connectPromise = null;
          this.notifyConnectionChange(false);

          if (!settled) {
            settled = true;
            reject(new Error("WebSocket closed before opening"));
          }

          this.handleReconnect();
        };

        this.ws.onerror = () => {
          console.warn("[WS] Connection error — will reconnect");
          // Let onclose handle settlement and reconnect — onerror always fires before onclose
        };
      } catch (error) {
        this.connectPromise = null;
        reject(error);
      }
    });
  }

  private matchesSubscription(
    channel: string,
    subscription: WsSubscription,
    msg: { data?: { coin?: string; user?: string } }
  ): boolean {
    if (channel === subscription.type) {
      if (subscription.coin && msg.data) {
        const dataCoin = (msg.data as { coin?: string }).coin;
        return dataCoin === subscription.coin;
      }
      if (subscription.user && msg.data) {
        const dataUser = (msg.data as { user?: string }).user;
        return !dataUser || dataUser.toLowerCase() === subscription.user.toLowerCase();
      }
      return true;
    }

    return false;
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.error("[WS] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );

    console.log(
      `[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      // Skip if already connected or another connect() is in progress
      if (this.ws?.readyState === WebSocket.OPEN || this.connectPromise) {
        return;
      }

      this.connectPromise = this.createConnection();
      this.connectPromise.catch((err) => {
        console.error("[WS] Reconnection failed:", err);
      });
    }, delay);
  }

  private send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  subscribe(subscription: WsSubscription, handler: MessageHandler): () => void {
    const key = this.getSubscriptionKey(subscription);

    this.subscriptions.set(key, { subscription, handler });

    // Send subscribe if already connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ method: "subscribe", subscription });
    }
    // If not connected, onopen will resubscribe all stored subscriptions

    return () => {
      this.subscriptions.delete(key);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ method: "unsubscribe", subscription });
      }
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.subscriptions.clear();
    this.connectPromise = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.notifyConnectionChange(false);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsClient = new HyperliquidWebSocket();

// Convenience subscription functions
export function subscribeToAllMids(handler: (data: Record<string, string>) => void) {
  return wsClient.subscribe({ type: "allMids" }, (raw: unknown) => {
    // WS sends { mids: { "BTC": "63000", ... } } — extract the inner map
    const data = raw as { mids?: Record<string, string> };
    if (data.mids) {
      handler(data.mids);
    }
  });
}

export function subscribeToTrades(
  coin: string,
  handler: (data: Array<{ coin: string; side: string; px: string; sz: string; time: number; hash?: string }>) => void
) {
  return wsClient.subscribe({ type: "trades", coin }, (raw: unknown) => {
    handler(raw as Array<{ coin: string; side: string; px: string; sz: string; time: number; hash?: string }>);
  });
}

/**
 * Subscribe to L2 order book updates.
 * Normalizes both REST-style { px, sz, n } objects and WS-style [px, sz, n] tuples
 * into a consistent { px, sz, n } format.
 */
export function subscribeToL2Book(
  coin: string,
  handler: (data: {
    coin: string;
    levels: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>];
    isSnapshot: boolean;
  }) => void
) {
  return wsClient.subscribe({ type: "l2Book", coin }, (raw: unknown, isSnapshot: boolean) => {
    const data = raw as {
      coin: string;
      levels: Array<Array<unknown>>;
    };

    // Normalize: WS can send either [px, sz, n] tuples or {px, sz, n} objects
    function normalizeLevel(level: unknown): { px: string; sz: string; n: number } {
      if (Array.isArray(level)) {
        return { px: String(level[0]), sz: String(level[1]), n: Number(level[2]) };
      }
      const obj = level as { px: string; sz: string; n: number };
      return { px: obj.px, sz: obj.sz, n: obj.n };
    }

    const bids = (data.levels[0] || []).map(normalizeLevel);
    const asks = (data.levels[1] || []).map(normalizeLevel);

    handler({
      coin: data.coin,
      levels: [bids, asks],
      isSnapshot,
    });
  });
}

export function subscribeToCandle(
  coin: string,
  interval: string,
  handler: (data: { t: number; o: string; h: string; l: string; c: string; v: string }[]) => void
) {
  return wsClient.subscribe({ type: "candle", coin, interval }, (raw: unknown) => {
    handler(raw as { t: number; o: string; h: string; l: string; c: string; v: string }[]);
  });
}

export function subscribeToUserFills(
  user: string,
  handler: (data: { isSnapshot: boolean; fills: unknown[] }) => void
) {
  return wsClient.subscribe({ type: "userFills", user }, (raw: unknown) => {
    handler(raw as { isSnapshot: boolean; fills: unknown[] });
  });
}
