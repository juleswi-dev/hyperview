# Hyperliquid Market Visualization App

## Projektübersicht
Eine Next.js Web-App zur Visualisierung von Hyperliquid DEX Marktdaten in Echtzeit, inklusive Liquidationen, Order Books, Trades und Funding Rates.

## Tech Stack
- **Frontend**: Next.js 14+ (App Router), React 18+, TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand oder React Context
- **Charts**: Lightweight-charts (TradingView) oder Recharts
- **WebSocket**: Native WebSocket API oder `hyperliquid` npm Package
- **HTTP Client**: Native fetch

## Hyperliquid API Referenz

### Base URLs
```
Mainnet REST:  https://api.hyperliquid.xyz/info (POST)
Mainnet WS:    wss://api.hyperliquid.xyz/ws
Testnet REST:  https://api.hyperliquid-testnet.xyz/info
Testnet WS:    wss://api.hyperliquid-testnet.xyz/ws
```

### Info Endpoint (REST API)
Alle Requests sind POST mit `Content-Type: application/json`

#### Perpetuals Endpunkte
| Type | Beschreibung | Parameter |
|------|--------------|-----------|
| `meta` | Asset-Metadaten (Namen, Leverage, Decimals) | `dex?` |
| `metaAndAssetCtxs` | Meta + Mark Price, Funding, OI | `dex?` |
| `clearinghouseState` | User-Positionen, Liquidation Price | `user` |
| `userFunding` | Funding-Zahlungen eines Users | `user`, `startTime`, `endTime?` |
| `fundingHistory` | Historische Funding Rates | `coin`, `startTime`, `endTime?` |
| `predictedFundings` | Vorhergesagte Funding Rates | - |

#### Spot Endpunkte
| Type | Beschreibung | Parameter |
|------|--------------|-----------|
| `spotMeta` | Token-Metadaten | - |
| `spotMetaAndAssetCtxs` | Meta + Preise, Volumen | - |
| `spotClearinghouseState` | User Token Balances | `user` |

#### Allgemeine Endpunkte
| Type | Beschreibung | Parameter |
|------|--------------|-----------|
| `allMids` | Mid-Preise aller Assets | `dex?` |
| `l2Book` | Order Book (max 20 Levels) | `coin`, `nSigFigs?` |
| `candleSnapshot` | OHLCV Kerzen (max 5000) | `coin`, `interval`, `startTime`, `endTime?` |
| `userFills` | Letzte 2000 Trades eines Users | `user` |
| `userFillsByTime` | Trades nach Zeitraum | `user`, `startTime`, `endTime?` |
| `openOrders` | Offene Orders | `user` |

### WebSocket Subscriptions
```typescript
// Verbindung: wss://api.hyperliquid.xyz/ws
// Subscribe Format:
{ "method": "subscribe", "subscription": { "type": "<type>", ...params } }

// Unsubscribe:
{ "method": "unsubscribe", "subscription": { "type": "<type>", ...params } }
```

| Channel | Subscription | Daten |
|---------|-------------|-------|
| `allMids` | `{ type: "allMids" }` | Alle Mid-Preise |
| `trades` | `{ type: "trades", coin: "BTC" }` | Live Trades |
| `l2Book` | `{ type: "l2Book", coin: "BTC" }` | Order Book Updates |
| `candle` | `{ type: "candle", coin: "BTC", interval: "1m" }` | Kerzen-Updates |
| `bbo` | `{ type: "bbo", coin: "BTC" }` | Best Bid/Offer |
| `userFills` | `{ type: "userFills", user: "0x..." }` | User Trades |
| `userFundings` | `{ type: "userFundings", user: "0x..." }` | Funding Payments |
| `userNonFundingLedgerUpdates` | `{ type: "userNonFundingLedgerUpdates", user: "0x..." }` | **Liquidationen**, Deposits, Withdrawals |
| `userEvents` | `{ type: "userEvents", user: "0x..." }` | Alle User Events inkl. Liquidationen |
| `orderUpdates` | `{ type: "orderUpdates", user: "0x..." }` | Order Status Updates |

### Liquidations Datenstruktur
```typescript
interface WsLedgerLiquidation {
  type: "liquidation";
  accountValue: string;       // Bei Isolated: isolated account value
  leverageType: "Cross" | "Isolated";
  liquidatedPositions: Array<{
    coin: string;
    szi: string;              // Signed size (negativ = short)
  }>;
}
```

### Candle Intervalle
`1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M`

### Rate Limits
- Address-basiert
- 100 Tokens, 10 Tokens/Sekunde Regeneration
- Optional: Request Weight kaufen (0.0005 USDC/Request)

### Response Pagination
- Max 500 Elemente pro Response
- Für mehr: `startTime` auf letzten Timestamp setzen

## TypeScript SDK (Optional)
```bash
npm i hyperliquid
```

```typescript
import Hyperliquid from 'hyperliquid';

const sdk = new Hyperliquid({ enableWs: true });
await sdk.connect();

// REST
const mids = await sdk.info.getAllMids();
const book = await sdk.info.getL2Book("BTC");

// WebSocket
sdk.subscriptions.subscribeToAllMids(data => console.log(data));
sdk.subscriptions.subscribeToCandle("BTC-PERP", "1m", data => console.log(data));
```

## Projektstruktur
```
/app
  /page.tsx                 # Dashboard Hauptseite
  /liquidations/page.tsx    # Liquidations Feed
  /markets/[coin]/page.tsx  # Einzelne Markt-Ansicht
  /api                      # API Routes (optional für caching)
/components
  /charts                   # Chart Komponenten
  /market                   # Markt-spezifische Komponenten
  /layout                   # Layout Komponenten
/lib
  /hyperliquid
    /api.ts                 # REST API Wrapper
    /websocket.ts           # WebSocket Manager
    /types.ts               # TypeScript Interfaces
/hooks
  /useWebSocket.ts          # WebSocket Hook
  /useMarketData.ts         # Marktdaten Hook
```

## Key Features für Implementation
1. **Live Liquidations Feed** - via `userNonFundingLedgerUpdates` WebSocket
2. **Order Book Visualisierung** - via `l2Book` REST + WebSocket
3. **Price Charts** - via `candleSnapshot` REST + `candle` WebSocket
4. **Funding Rates Dashboard** - via `metaAndAssetCtxs` + `predictedFundings`
5. **Open Interest Tracking** - via `metaAndAssetCtxs`
6. **Live Trades Feed** - via `trades` WebSocket

## Wichtige Hinweise
- WebSocket reconnection handling implementieren
- Snapshot (`isSnapshot: true`) bei erster Message beachten
- Asset-Identifikation: Perpetuals = Coin Name, Spot = `@{index}` oder `TOKEN/USDC`
- Alle Preise und Sizes als Strings behandeln (BigNumber für Präzision)

---

## Globale Liquidationen tracken - REALITÄT

### Was die native Hyperliquid API NICHT bietet
- **Kein `allLiquidations` Endpoint** - existiert nicht
- **Kein globaler Liquidations-Feed** - nur user-spezifisch
- Thunderhead Labs nutzt **AWS S3** (interner Hyperliquid-Zugang)
- Moon Dev hat einen **eigenen Aggregations-Service** gebaut

### Was wir MIT der nativen API machen können

#### Option 1: HLP Vault Fills (Nur Backstop-Liquidationen)

### Wichtige Adressen
```typescript
const ADDRESSES = {
  HLP_VAULT: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
  HLP_LEADER: "0x677d831aef5328190852e24f13c46cac05f984e7",
  SYSTEM_FUND: "0xfefefefefefefefefefefefefefefefefefefefe"
};
```

### Strategie: HLP Vault Fills abfragen

Jeder Fill des HLP Vaults kann ein `liquidation` Feld enthalten:

```typescript
interface Fill {
  coin: string;
  px: string;           // Preis
  sz: string;           // Size
  side: "A" | "B";      // Ask/Bid
  time: number;
  hash: string;
  oid: number;
  tid: number;
  fee: string;
  // DAS IST DER KEY:
  liquidation?: {
    liquidatedUser: string;   // Wer wurde liquidiert (0x...)
    markPx: string;           // Mark Price bei Liquidation
    method: "market" | "backstop";  // Liquidations-Typ
  };
}
```

### REST API: HLP Fills abfragen
```typescript
// Letzte 2000 Fills der HLP Vault
const response = await fetch("https://api.hyperliquid.xyz/info", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "userFills",
    user: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303"
  })
});

const fills = await response.json();

// Nur Liquidationen filtern
const liquidations = fills.filter(fill => fill.liquidation != null);
```

### REST API: Fills nach Zeitraum
```typescript
const response = await fetch("https://api.hyperliquid.xyz/info", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "userFillsByTime",
    user: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
    startTime: Date.now() - 3600000,  // Letzte Stunde
    endTime: Date.now()
  })
});
```

### WebSocket: Live Liquidationen
```typescript
const ws = new WebSocket("wss://api.hyperliquid.xyz/ws");

ws.onopen = () => {
  // Subscribe zu HLP Vault Fills
  ws.send(JSON.stringify({
    method: "subscribe",
    subscription: {
      type: "userFills",
      user: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303"
    }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.channel === "userFills") {
    const fills = msg.data.fills || [msg.data];

    // Liquidationen extrahieren
    fills.forEach(fill => {
      if (fill.liquidation) {
        console.log("LIQUIDATION!", {
          coin: fill.coin,
          size: fill.sz,
          price: fill.px,
          liquidatedUser: fill.liquidation.liquidatedUser,
          method: fill.liquidation.method,
          time: fill.time
        });
      }
    });
  }
};
```

### Zusätzliche Methode: Alle Trades monitoren

Nicht alle Liquidationen gehen durch HLP (Market Liquidations gehen ins Orderbook).
Für vollständige Erfassung: `trades` Channel + große Orders filtern.

```typescript
// Subscribe zu allen Trades eines Coins
ws.send(JSON.stringify({
  method: "subscribe",
  subscription: { type: "trades", coin: "BTC" }
}));

// Große Trades (>$50k) als potentielle Liquidationen markieren
const LIQUIDATION_THRESHOLD = 50000; // USD
```

### Liquidation Types

| Method | Beschreibung |
|--------|--------------|
| `market` | Position wird über Orderbook geschlossen (Market Order) |
| `backstop` | HLP Vault übernimmt Position (unter 2/3 Maintenance Margin) |

#### Option 2: Liquidatable Endpoint (Wer ist KURZ VOR Liquidation)
```typescript
// Prüfen ob ein User kurz vor Liquidation steht
const res = await fetch("https://api.hyperliquid.xyz/info", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "liquidatable",
    user: "0x..."  // Wallet-Adresse
  })
});
// Returns: [] wenn sicher, oder Liquidations-Risiko-Details
```

#### Option 3: Große Trades als Proxy (Heuristik)
```typescript
// Große Market Orders sind oft Liquidationen
// Subscribe zu trades und filter nach Size
ws.send(JSON.stringify({
  method: "subscribe",
  subscription: { type: "trades", coin: "BTC" }
}));

// Filter: Trades > $50k könnten Liquidationen sein
const THRESHOLD = 50000;
trades.filter(t => parseFloat(t.sz) * parseFloat(t.px) > THRESHOLD);
```

#### Option 4: Eigenen Aggregator bauen (Aufwändig)
1. Liste von aktiven Wallets sammeln (via `allMids` + Trades)
2. Für jede Wallet `clearinghouseState` abfragen
3. Wallets mit hohem Risiko (nahe Liquidation Price) überwachen
4. `userNonFundingLedgerUpdates` für diese Wallets subscriben

### Fill-Struktur mit Liquidation-Feld
```typescript
interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B";
  time: number;
  hash: string;
  // Liquidation-spezifische Felder (optional):
  liquidationMarkPx?: string;  // Wenn vorhanden = Liquidation Fill
  liquidation?: {
    liquidatedUser: string;
    markPx: string;
    method: "market" | "backstop";
  };
}
```

### Realistische Implementation für deine App

```typescript
// liquidation-tracker.ts
const HLP_VAULT = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

interface Liquidation {
  coin: string;
  size: number;
  price: number;
  value: number;
  side: "long" | "short";
  method: "market" | "backstop";
  time: number;
  hash: string;
  liquidatedUser?: string;
}

export class LiquidationTracker {
  private ws: WebSocket | null = null;
  private liquidations: Liquidation[] = [];
  private largeTrades: Liquidation[] = [];  // Potentielle Market-Liquidations
  private onUpdate: (liqs: Liquidation[]) => void;

  constructor(onUpdate: (liqs: Liquidation[]) => void) {
    this.onUpdate = onUpdate;
  }

  async connect() {
    this.ws = new WebSocket("wss://api.hyperliquid.xyz/ws");

    this.ws.onopen = () => {
      // 1. HLP Vault Fills (Backstop Liquidations)
      this.ws!.send(JSON.stringify({
        method: "subscribe",
        subscription: { type: "userFills", user: HLP_VAULT }
      }));

      // 2. Trades für Top-Coins (Market Liquidations als große Orders)
      ["BTC", "ETH", "SOL"].forEach(coin => {
        this.ws!.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "trades", coin }
        }));
      });
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.channel === "subscriptionResponse") return;

      if (msg.channel === "userFills") {
        this.processHLPFills(msg.data);
      }

      if (msg.channel === "trades") {
        this.processTradesForLargOrders(msg.data);
      }
    };

    this.ws.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  private processHLPFills(data: any) {
    const fills = data.fills || [data];

    fills.forEach((fill: any) => {
      // Nur Fills mit liquidation Feld sind echte Liquidationen
      if (fill.liquidationMarkPx || fill.liquidation) {
        const liq: Liquidation = {
          coin: fill.coin,
          size: Math.abs(parseFloat(fill.sz)),
          price: parseFloat(fill.px),
          value: Math.abs(parseFloat(fill.sz)) * parseFloat(fill.px),
          side: fill.side === "B" ? "long" : "short",
          method: fill.liquidation?.method || "backstop",
          time: fill.time,
          hash: fill.hash,
          liquidatedUser: fill.liquidation?.liquidatedUser
        };
        this.liquidations.unshift(liq);
      }
    });

    this.notifyUpdate();
  }

  private processTradesForLargOrders(trades: any[]) {
    const THRESHOLD = 100000; // $100k

    trades.forEach(trade => {
      const value = parseFloat(trade.sz) * parseFloat(trade.px);
      if (value > THRESHOLD) {
        // Große Market Order - KÖNNTE eine Liquidation sein
        const potentialLiq: Liquidation = {
          coin: trade.coin,
          size: parseFloat(trade.sz),
          price: parseFloat(trade.px),
          value,
          side: trade.side === "B" ? "long" : "short",
          method: "market",  // Annahme
          time: trade.time,
          hash: trade.hash
        };
        this.largeTrades.unshift(potentialLiq);
      }
    });

    // Limit speichern
    this.largeTrades = this.largeTrades.slice(0, 100);
    this.notifyUpdate();
  }

  private notifyUpdate() {
    // Kombiniere bestätigte Liquidations + große Trades
    const all = [...this.liquidations, ...this.largeTrades]
      .sort((a, b) => b.time - a.time)
      .slice(0, 200);
    this.onUpdate(all);
  }

  getLiquidations() {
    return this.liquidations;
  }

  getLargeTrades() {
    return this.largeTrades;
  }

  disconnect() {
    this.ws?.close();
  }
}
```

---

## Moon Dev Data Layer API (Alternative - benötigt API Key)

Die native Hyperliquid API bietet **keine globalen Liquidationsdaten** - nur user-spezifische.
Moon Dev's Data Layer löst dieses Problem mit aggregierten Liquidationsdaten.

### Base URL & Auth
```
Base URL: https://api.moondev.com
Auth: X-API-Key Header oder ?api_key= Query Parameter
API Key: Registrierung auf https://moondev.com
Rate Limit: 3.600 req/min (60/sec)
```

### Liquidation Endpunkte (GET Requests)

#### Hyperliquid Liquidationen
| Endpoint | Beschreibung |
|----------|--------------|
| `/api/liquidations/10m.json` | Letzte 10 Minuten |
| `/api/liquidations/1h.json` | Letzte Stunde |
| `/api/liquidations/24h.json` | Letzte 24 Stunden |
| `/api/liquidations/7d.json` | Letzte 7 Tage |
| `/api/liquidations/stats.json` | Aggregierte Statistiken |

#### Multi-Exchange Liquidationen
| Endpoint | Exchange |
|----------|----------|
| `/api/all_liquidations/{timeframe}.json` | Alle kombiniert |
| `/api/binance_liquidations/{timeframe}.json` | Binance Futures |
| `/api/bybit_liquidations/{timeframe}.json` | Bybit |
| `/api/okx_liquidations/{timeframe}.json` | OKX |

Timeframes: `10m`, `1h`, `4h`, `24h`, `7d`, `30d`, `stats`

### Liquidation Response Format
```typescript
interface LiquidationStats {
  total_count: number;
  total_value_usd: number;
  long_count: number;
  short_count: number;
  long_value_usd: number;
  short_value_usd: number;
  largest: Array<{
    value_usd: number;
    coin: string;
    side: "long" | "short";
    price: number;
    address: string;
    timestamp: number;
  }>;
  by_coin: Record<string, {
    count: number;
    total_value_usd: number;
    long_value_usd: number;
    short_value_usd: number;
  }>;
}
```

### Weitere nützliche Moon Dev Endpunkte

#### Whale & Position Tracking
| Endpoint | Beschreibung |
|----------|--------------|
| `/api/positions.json` | Top 50 Positionen (1-sec Updates) |
| `/api/positions/all.json` | Alle 148 Symbole |
| `/api/whales.json` | Whale Trades ≥$25k |
| `/api/buyers.json` | Käufe ≥$5k |

#### Marktdaten (Keine Rate Limits)
| Endpoint | Beschreibung |
|----------|--------------|
| `/api/prices` | Alle 224 Coin-Preise |
| `/api/price/{coin}` | Einzelner Preis |
| `/api/orderbook/{coin}` | L2 Order Book |
| `/api/candles/{coin}?interval=5m` | OHLCV Kerzen |
| `/api/account/{address}` | Wallet State |

#### HLP (Hyperliquidity Provider) - Retail Sentiment
| Endpoint | Beschreibung |
|----------|--------------|
| `/api/hlp/positions` | 7 Strategien Positionen |
| `/api/hlp/sentiment` | Z-Score (Retail Positioning) |
| `/api/hlp/delta` | Netto-Exposure |
| `/api/hlp/flips` | Position Flips |

#### Smart Money
| Endpoint | Beschreibung |
|----------|--------------|
| `/api/smart_money/rankings.json` | Top 100 profitable vs Bottom 100 |
| `/api/smart_money/signals_{timeframe}.json` | Trading Signals |

### TypeScript API Client für Moon Dev
```typescript
const MOONDEV_BASE = "https://api.moondev.com";

async function fetchMoonDev<T>(endpoint: string, apiKey: string): Promise<T> {
  const res = await fetch(`${MOONDEV_BASE}${endpoint}`, {
    headers: { "X-API-Key": apiKey }
  });
  return res.json();
}

// Beispiele
const liquidations = await fetchMoonDev("/api/liquidations/1h.json", API_KEY);
const allLiquidations = await fetchMoonDev("/api/all_liquidations/1h.json", API_KEY);
const whales = await fetchMoonDev("/api/whales.json", API_KEY);
const hlpSentiment = await fetchMoonDev("/api/hlp/sentiment", API_KEY);
```

### Empfohlene Kombination
| Feature | Datenquelle |
|---------|-------------|
| **Globale Liquidationen** | Moon Dev API |
| **Live Preise** | Hyperliquid WebSocket |
| **Order Book** | Hyperliquid WebSocket |
| **Charts/Candles** | Hyperliquid REST oder Moon Dev |
| **Whale Tracking** | Moon Dev API |
| **User Positionen** | Hyperliquid REST |
| **Funding Rates** | Hyperliquid REST |
| **Retail Sentiment** | Moon Dev HLP API |

### Ressourcen
- [Moon Dev GitHub](https://github.com/moondevonyt/Hyperliquid-Data-Layer-API)
- [Moon Dev API Docs](https://moondev.com/docs)
- [API Key Registration](https://moondev.com)

---

## Hyperliquid Node Setup (Stand 2026)

### Warum ein eigener Node?

Ein eigener Hyperliquid Node gibt dir **vollständigen Zugang** zu:
- **Alle Trades** in Echtzeit
- **Alle Fills** (inkl. Liquidationen)
- **Alle Order Status Updates**
- **State Snapshots** (alle Positionen aller User)
- **Lokalen Info-Server** (keine Rate Limits)

Das ist der Weg, wie Moon Dev seine Daten bekommt.

### Hardware-Anforderungen

| Rolle | vCPUs | RAM | Storage | Kosten/Monat |
|-------|-------|-----|---------|--------------|
| **Non-Validator** | 16 | 64 GB | 500 GB SSD | ~€100 (Hetzner) |
| **Validator** | 32 | 128 GB | 1 TB SSD | ~€200 (Hetzner) |

**Betriebssystem:** Ubuntu 24.04 (einzige unterstützte Version)
**Ports:** 4001, 4002 öffentlich erreichbar
**Datenvolumen:** ~100 GB/Tag (Archivierung planen!)
**Optimale Location:** Tokyo (niedrigste Latenz)

### Kosten-Vergleich Server

| Provider | 32 vCPU / 128 GB | 16 vCPU / 64 GB |
|----------|------------------|-----------------|
| **Hetzner CCX** | ~€192/Monat | ~€96/Monat |
| **AWS m6i.8xlarge** | ~$1,121/Monat | ~$560/Monat |
| **OVH** | Nicht verfügbar | ~$50/Monat |

**Empfehlung:** Hetzner (5-6x günstiger als AWS)

### Non-Validator Node Setup

**1. Chain-Konfiguration erstellen:**
```bash
echo '{"chain": "Mainnet"}' > ~/visor.json
```

**2. Visor-Binary herunterladen:**
```bash
# Mainnet
curl https://binaries.hyperliquid.xyz/Mainnet/hl-visor > ~/hl-visor
chmod a+x ~/hl-visor

# Testnet (zum Testen)
curl https://binaries.hyperliquid-testnet.xyz/Testnet/hl-visor > ~/hl-visor
chmod a+x ~/hl-visor
```

**3. Node mit Daten-Streaming starten:**
```bash
~/hl-visor run-non-validator \
  --write-trades \
  --write-fills \
  --write-order-statuses \
  --serve-info
```

**Wichtige Flags:**
| Flag | Beschreibung | Output-Pfad |
|------|--------------|-------------|
| `--write-trades` | Alle Trades streamen | `~/hl/data/node_trades/hourly/{date}/{hour}` |
| `--write-fills` | Alle Fills (inkl. Liquidations) | `~/hl/data/node_fills/hourly/{date}/{hour}` |
| `--write-order-statuses` | Alle Order Updates | `~/hl/data/node_order_statuses/hourly/{date}/{hour}` |
| `--serve-info` | Lokaler Info-Server | `http://localhost:3001/info` |
| `--serve-eth-rpc` | EVM JSON-RPC | `http://localhost:3001/evm` |

### Daten-Output Struktur

```
~/hl/data/
├── replica_cmds/           # Alle Transaktionen (Blöcke)
│   └── {start_time}/{date}/{height}
├── periodic_abci_states/   # State Snapshots (alle 10k Blöcke)
│   └── {date}/{height}.rmp
├── node_trades/            # Trade-Stream
│   └── hourly/{date}/{hour}
├── node_fills/             # Fills (mit Liquidations!)
│   └── hourly/{date}/{hour}
└── node_order_statuses/    # Order Updates
    └── hourly/{date}/{hour}
```

### Fills-Format (enthält Liquidationen!)

```json
{
  "coin": "BTC",
  "px": "84500.0",
  "sz": "0.5",
  "side": "B",
  "time": 1769720799702,
  "hash": "0x...",
  "oid": 12345,
  "tid": 67890,
  "fee": "0.025",
  "liquidation": {
    "liquidatedUser": "0x...",
    "markPx": "84400.0",
    "method": "backstop"
  }
}
```

**Das `liquidation` Feld ist nur vorhanden bei Liquidations-Fills!**

### State Snapshots auslesen

State Snapshots enthalten **alle Positionen aller User**:

```bash
# Snapshot zu JSON konvertieren
./hl-node --chain Mainnet translate-abci-state \
  ~/hl/data/periodic_abci_states/{date}/{height}.rmp \
  /tmp/state.json

# L4 Order Book Snapshots berechnen
./hl-node --chain Mainnet compute-l4-snapshots \
  ~/hl/data/periodic_abci_states/{date}/{height}.rmp \
  /tmp/orderbooks/
```

### Lokaler Info-Server

Mit `--serve-info` läuft ein lokaler Server ohne Rate Limits:

```bash
# Alle Positionen eines Users (kein Rate Limit!)
curl -X POST http://localhost:3001/info \
  -H 'Content-Type: application/json' \
  -d '{"type":"clearinghouseState","user":"0x..."}'

# Offene Orders
curl -X POST http://localhost:3001/info \
  -d '{"type":"openOrders","user":"0x..."}'

# Prüfen ob User liquidierbar ist
curl -X POST http://localhost:3001/info \
  -d '{"type":"liquidatable","user":"0x..."}'
```

**Unterstützte Endpoints:**
- `meta`, `spotMeta`
- `clearinghouseState`, `spotClearinghouseState`
- `openOrders`
- `liquidatable`
- `activeAssetData`
- `userFees`, `userRateLimit`

### Fills in Echtzeit parsen (für Liquidationen)

```python
import json
import os
from pathlib import Path
from datetime import datetime

FILLS_DIR = Path("~/hl/data/node_fills/hourly").expanduser()

def watch_liquidations():
    """Watch fills directory for new liquidations"""
    seen_files = set()

    while True:
        # Get current hour's directory
        now = datetime.utcnow()
        hour_dir = FILLS_DIR / now.strftime("%Y-%m-%d") / now.strftime("%H")

        if hour_dir.exists():
            for file in hour_dir.iterdir():
                if file not in seen_files:
                    seen_files.add(file)
                    process_fills_file(file)

        time.sleep(1)

def process_fills_file(filepath):
    """Parse fills and extract liquidations"""
    with open(filepath) as f:
        for line in f:
            fill = json.loads(line)
            if "liquidation" in fill:
                print(f"🔴 LIQUIDATION: {fill['coin']}")
                print(f"   Size: {fill['sz']} @ {fill['px']}")
                print(f"   User: {fill['liquidation']['liquidatedUser']}")
                print(f"   Method: {fill['liquidation']['method']}")
```

### Alle Positionen aus State Snapshot

```python
import json
import msgpack  # pip install msgpack

def get_all_positions(snapshot_path):
    """Extract all user positions from state snapshot"""

    # Erst mit hl-node zu JSON konvertieren
    # ./hl-node --chain Mainnet translate-abci-state snapshot.rmp state.json

    with open("state.json") as f:
        state = json.load(f)

    positions = []
    for user_addr, user_state in state.get("clearinghouse", {}).items():
        for position in user_state.get("positions", []):
            positions.append({
                "user": user_addr,
                "coin": position["coin"],
                "size": position["szi"],
                "entry_price": position["entryPx"],
                "leverage": position["leverage"],
                "liquidation_price": calculate_liq_price(position)
            })

    return positions

def calculate_liq_price(position):
    """Calculate liquidation price for a position"""
    # Simplified - actual formula is more complex
    entry = float(position["entryPx"])
    leverage = float(position["leverage"]["value"])
    size = float(position["szi"])

    maintenance_margin = 1 / (leverage * 2)  # ~50% of initial margin

    if size > 0:  # Long
        return entry * (1 - maintenance_margin)
    else:  # Short
        return entry * (1 + maintenance_margin)
```

### Zusammenfassung: Was der Node ermöglicht

| Feature | Öffentliche API | Eigener Node |
|---------|-----------------|--------------|
| Alle Trades live | ❌ (nur per Coin) | ✅ |
| Alle Fills mit Liquidations | ❌ | ✅ |
| Alle User-Positionen | ❌ | ✅ (State Snapshot) |
| Liquidation Prices berechnen | ❌ | ✅ |
| Kein Rate Limit | ❌ | ✅ |
| Historische Daten | ❌ | ✅ (~100GB/Tag) |

### Kosten-Übersicht

| Komponente | Einmalig | Monatlich |
|------------|----------|-----------|
| Server (Hetzner CCX33) | - | ~€96 |
| Storage (zusätzlich für Archiv) | - | ~€20-50 |
| **Total Non-Validator** | - | **~€120-150/Monat** |

### Ressourcen
- [Hyperliquid Node GitHub](https://github.com/hyperliquid-dex/node)
- [Validator Guide](https://hyperliquid.gitbook.io/hyperliquid-docs/validators/running-a-validator)
- [Hetzner Cloud](https://www.hetzner.com/cloud)
