# Hyperliquid Market Visualization - Implementierungsplan

## Phase 1: Projekt Setup & Grundstruktur

### 1.1 Next.js Projekt initialisieren
```bash
npx create-next-app@latest hyperapp --typescript --tailwind --app --eslint
cd hyperapp
npm install zustand recharts lightweight-charts
```

### 1.2 Projektstruktur anlegen
- `/lib/hyperliquid/` - API Layer
- `/components/` - UI Komponenten
- `/hooks/` - Custom React Hooks
- `/types/` - TypeScript Definitionen

---

## Phase 2: Hyperliquid API Layer

### 2.1 TypeScript Types definieren (`/lib/hyperliquid/types.ts`)
```typescript
// Asset Metadata
interface AssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

// Market Context
interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
}

// Order Book Level
interface BookLevel {
  px: string;  // Price
  sz: string;  // Size
  n: number;   // Number of orders
}

// Trade
interface Trade {
  coin: string;
  side: "A" | "B";  // A=Ask/Sell, B=Bid/Buy
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
}

// Fill mit Liquidation (von HLP Vault)
interface FillLiquidation {
  liquidatedUser: string;   // Wallet des liquidierten Users
  markPx: string;           // Mark Price bei Liquidation
  method: "market" | "backstop";  // Liquidations-Typ
}

interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B";  // A=Ask/Sell, B=Bid/Buy
  time: number;
  hash: string;
  oid: number;
  tid: number;
  fee: string;
  liquidation?: FillLiquidation;  // NUR bei Liquidationen vorhanden!
}

// Aufbereitete Liquidation für UI
interface Liquidation {
  coin: string;
  size: number;
  price: number;
  value: number;
  side: "long" | "short";
  liquidatedUser: string;
  method: "market" | "backstop";
  time: number;
  hash: string;
}

// Candle
interface Candle {
  t: number;  // Timestamp
  o: string;  // Open
  h: string;  // High
  l: string;  // Low
  c: string;  // Close
  v: string;  // Volume
}
```

### 2.2 REST API Client (`/lib/hyperliquid/api.ts`)
```typescript
const BASE_URL = "https://api.hyperliquid.xyz";

export async function fetchInfo<T>(payload: object): Promise<T> {
  const res = await fetch(`${BASE_URL}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Convenience methods
export const api = {
  getMeta: () => fetchInfo({ type: "meta" }),
  getMetaAndAssetCtxs: () => fetchInfo({ type: "metaAndAssetCtxs" }),
  getAllMids: () => fetchInfo({ type: "allMids" }),
  getL2Book: (coin: string) => fetchInfo({ type: "l2Book", coin }),
  getCandles: (coin: string, interval: string, startTime: number) =>
    fetchInfo({ type: "candleSnapshot", req: { coin, interval, startTime } }),
  getFundingHistory: (coin: string, startTime: number) =>
    fetchInfo({ type: "fundingHistory", coin, startTime }),
  getPredictedFundings: () => fetchInfo({ type: "predictedFundings" }),
};
```

### 2.3 WebSocket Manager (`/lib/hyperliquid/websocket.ts`)
```typescript
type MessageHandler = (data: any) => void;

class HyperliquidWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, MessageHandler> = new Map();
  private reconnectAttempts = 0;
  private maxReconnects = 5;

  connect() {
    this.ws = new WebSocket("wss://api.hyperliquid.xyz/ws");

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Resubscribe after reconnect
      this.subscriptions.forEach((_, key) => {
        const sub = JSON.parse(key);
        this.send({ method: "subscribe", subscription: sub });
      });
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.channel === "subscriptionResponse") return;

      const key = JSON.stringify(msg.channel);
      const handler = this.subscriptions.get(key);
      if (handler) handler(msg.data);
    };

    this.ws.onclose = () => this.handleReconnect();
    this.ws.onerror = () => this.ws?.close();
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnects) {
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    }
  }

  subscribe(subscription: object, handler: MessageHandler) {
    const key = JSON.stringify(subscription);
    this.subscriptions.set(key, handler);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ method: "subscribe", subscription });
    }
  }

  unsubscribe(subscription: object) {
    const key = JSON.stringify(subscription);
    this.subscriptions.delete(key);
    this.send({ method: "unsubscribe", subscription });
  }

  private send(data: object) {
    this.ws?.send(JSON.stringify(data));
  }

  disconnect() {
    this.ws?.close();
  }
}

export const wsClient = new HyperliquidWebSocket();
```

---

## Phase 3: React Hooks

### 3.1 useWebSocket Hook (`/hooks/useWebSocket.ts`)
```typescript
export function useWebSocket<T>(
  subscription: object,
  onMessage: (data: T) => void
) {
  useEffect(() => {
    wsClient.subscribe(subscription, onMessage);
    return () => wsClient.unsubscribe(subscription);
  }, [JSON.stringify(subscription)]);
}
```

### 3.2 useMarketData Hook (`/hooks/useMarketData.ts`)
```typescript
export function useMarketData() {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [contexts, setContexts] = useState<AssetCtx[]>([]);
  const [mids, setMids] = useState<Record<string, string>>({});

  // Initial fetch
  useEffect(() => {
    api.getMetaAndAssetCtxs().then(([meta, ctxs]) => {
      setAssets(meta.universe);
      setContexts(ctxs);
    });
  }, []);

  // Live updates
  useWebSocket({ type: "allMids" }, setMids);

  return { assets, contexts, mids };
}
```

### 3.3 useLiquidations Hook (`/hooks/useLiquidations.ts`)
```typescript
// STRATEGIE: HLP Vault Fills tracken - diese enthalten Liquidations-Daten!

const HLP_VAULT = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

interface FillLiquidation {
  liquidatedUser: string;
  markPx: string;
  method: "market" | "backstop";
}

interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B";
  time: number;
  hash: string;
  liquidation?: FillLiquidation;
}

interface Liquidation {
  coin: string;
  size: number;
  price: number;
  value: number;
  side: "long" | "short";
  liquidatedUser: string;
  method: "market" | "backstop";
  time: number;
  hash: string;
}

export function useLiquidations() {
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Initial: Historische Liquidationen laden (24h)
  useEffect(() => {
    async function loadHistory() {
      const res = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "userFillsByTime",
          user: HLP_VAULT,
          startTime: Date.now() - 86400000 // 24h
        })
      });
      const fills: Fill[] = await res.json();
      processNewFills(fills);
    }
    loadHistory();
  }, []);

  // WebSocket: Live Updates
  useEffect(() => {
    const ws = new WebSocket("wss://api.hyperliquid.xyz/ws");

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({
        method: "subscribe",
        subscription: { type: "userFills", user: HLP_VAULT }
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.channel === "userFills") {
        const fills = msg.data.fills || [msg.data];
        processNewFills(fills);
      }
    };

    ws.onclose = () => setIsConnected(false);

    return () => ws.close();
  }, []);

  function processNewFills(fills: Fill[]) {
    const newLiqs = fills
      .filter(f => f.liquidation)
      .map(f => ({
        coin: f.coin,
        size: Math.abs(parseFloat(f.sz)),
        price: parseFloat(f.px),
        value: Math.abs(parseFloat(f.sz)) * parseFloat(f.px),
        // B=Buy bedeutet HLP kauft = Short wurde liquidiert = Long Liq
        side: f.side === "B" ? "long" : "short" as "long" | "short",
        liquidatedUser: f.liquidation!.liquidatedUser,
        method: f.liquidation!.method,
        time: f.time,
        hash: f.hash
      }));

    if (newLiqs.length > 0) {
      setLiquidations(prev => {
        const combined = [...newLiqs, ...prev];
        // Deduplizieren nach hash
        const unique = combined.filter((liq, i, arr) =>
          arr.findIndex(l => l.hash === liq.hash) === i
        );
        // Nach Zeit sortieren (neueste zuerst)
        return unique.sort((a, b) => b.time - a.time).slice(0, 1000);
      });
    }
  }

  // Statistiken berechnen
  const stats = useMemo(() => {
    const now = Date.now();
    const last1h = liquidations.filter(l => l.time > now - 3600000);
    const last24h = liquidations.filter(l => l.time > now - 86400000);

    return {
      count1h: last1h.length,
      count24h: last24h.length,
      volume1h: last1h.reduce((sum, l) => sum + l.value, 0),
      volume24h: last24h.reduce((sum, l) => sum + l.value, 0),
      longVolume24h: last24h.filter(l => l.side === "long").reduce((sum, l) => sum + l.value, 0),
      shortVolume24h: last24h.filter(l => l.side === "short").reduce((sum, l) => sum + l.value, 0),
    };
  }, [liquidations]);

  return { liquidations, stats, isConnected };
}
```

---

## Phase 4: UI Komponenten

### 4.1 Market Overview Dashboard
- Asset-Liste mit Live-Preisen
- 24h Volume & Change
- Open Interest
- Funding Rates (aktuell + predicted)

### 4.2 Liquidations Feed Komponente
```typescript
function LiquidationsFeed() {
  const liquidations = useLiquidationFeed();

  return (
    <div className="space-y-2">
      {liquidations.map((liq) => (
        <div key={liq.time} className="flex justify-between p-2 bg-red-900/20">
          <span>{liq.liquidatedPositions[0]?.coin}</span>
          <span>${formatUSD(liq.accountValue)}</span>
          <span>{liq.leverageType}</span>
        </div>
      ))}
    </div>
  );
}
```

### 4.3 Order Book Visualisierung
- Bid/Ask Depth Chart
- Live Order Book Levels
- Spread Indicator

### 4.4 Price Chart
- TradingView Lightweight Charts
- Multiple Timeframes
- Volume Bars

### 4.5 Trades Feed
- Live Trades Stream
- Buy/Sell Färbung
- Size Highlighting

---

## Phase 5: Seiten

### 5.1 Dashboard (`/app/page.tsx`)
- Market Overview Grid
- Top Movers
- Liquidations Summary
- Funding Rate Heatmap

### 5.2 Liquidations Page (`/app/liquidations/page.tsx`)
- Live Liquidations Feed
- Historische Liquidationen
- Statistiken (Total liquidiert pro Tag)

### 5.3 Einzelner Markt (`/app/markets/[coin]/page.tsx`)
- Full Price Chart
- Order Book
- Recent Trades
- Funding History
- Position Calculator

---

## Phase 6: Optimierungen

### 6.1 Performance
- React.memo für Listen-Items
- Virtualisierte Listen für Trades/Liquidations
- WebSocket Message Batching
- Server Components wo möglich

### 6.2 Error Handling
- API Error Boundaries
- WebSocket Reconnection UI
- Fallback Loading States

### 6.3 Caching
- SWR oder React Query für REST Calls
- Optional: Redis für Server-Side Caching

---

## Empfohlene Reihenfolge der Implementation

1. **Projekt Setup** - Next.js, Tailwind, Dependencies
2. **API Types** - TypeScript Interfaces
3. **REST API Client** - Basis-Funktionen
4. **WebSocket Manager** - Verbindung & Subscriptions
5. **Market Overview** - Erste funktionierende Seite
6. **Price Chart** - Candles + Live Updates
7. **Order Book** - Depth Visualisierung
8. **Liquidations Feed** - Echtzeit-Stream
9. **Polish** - Styling, Error Handling, Performance

---

## Zusätzliche Ressourcen

- [Hyperliquid Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)
- [TypeScript SDK](https://github.com/nomeida/hyperliquid)
- [Python SDK](https://github.com/hyperliquid-dex/hyperliquid-python-sdk)
- [Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
