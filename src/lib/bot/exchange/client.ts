import type {
  ExchangeClient,
  OrderRequest,
  CancelRequest,
  FillEvent,
  AccountState,
  AccountPosition,
} from "@/types/exchange";
import type { TradingMode } from "@/types/bot";
import type { Hex, Address } from "viem";
import { HyperliquidSigner, type OrderWire } from "./signer";

const MAINNET_URL = "https://api.hyperliquid.xyz";
const TESTNET_URL = "https://api.hyperliquid-testnet.xyz";

interface AssetInfo {
  name: string;
  szDecimals: number;
  index: number;
}

export class RealExchangeClient implements ExchangeClient {
  readonly mode: TradingMode;
  private signer: HyperliquidSigner;
  private baseUrl: string;
  private vaultAddress?: Address;
  private assetMap = new Map<string, AssetInfo>();

  constructor(
    mode: "mainnet" | "testnet",
    privateKey: Hex,
    vaultAddress?: Address,
  ) {
    this.mode = mode;
    const isTestnet = mode === "testnet";
    this.signer = new HyperliquidSigner(privateKey, isTestnet);
    this.baseUrl = isTestnet ? TESTNET_URL : MAINNET_URL;
    this.vaultAddress = vaultAddress;
  }

  async placeOrder(order: OrderRequest): Promise<string> {
    await this.ensureAssetMap();

    const asset = this.getAssetIndex(order.coin);
    const szDecimals = this.assetMap.get(order.coin)?.szDecimals ?? 4;

    // Convert to wire format
    const orderWire: OrderWire = {
      asset,
      isBuy: order.side === "buy",
      limitPx: order.orderType === "market"
        ? this.getMarketSlippagePrice(order.side).toString()
        : order.price!.toString(),
      sz: order.size.toFixed(szDecimals),
      reduceOnly: order.reduceOnly ?? false,
      orderType: order.orderType === "market"
        ? { limit: { tif: "Ioc" } }
        : { limit: { tif: order.timeInForce ?? "Gtc" } },
    };

    if (order.cloid) {
      orderWire.cloid = order.cloid;
    }

    const signed = await this.signer.signOrder([orderWire], this.vaultAddress);

    const res = await fetch(`${this.baseUrl}/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    });

    const data = await res.json();

    if (data.status === "err") {
      throw new Error(`Order failed: ${data.response}`);
    }

    // Extract order ID from response
    const statuses = data.response?.data?.statuses;
    if (statuses?.[0]?.resting?.oid) {
      return String(statuses[0].resting.oid);
    }
    if (statuses?.[0]?.filled?.oid) {
      return String(statuses[0].filled.oid);
    }

    return "unknown";
  }

  async cancelOrder(cancel: CancelRequest): Promise<void> {
    await this.ensureAssetMap();
    const asset = this.getAssetIndex(cancel.coin);

    const signed = await this.signer.signCancel(
      [{ asset, oid: parseInt(cancel.orderId) }],
      this.vaultAddress,
    );

    const res = await fetch(`${this.baseUrl}/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    });

    const data = await res.json();
    if (data.status === "err") {
      throw new Error(`Cancel failed: ${data.response}`);
    }
  }

  async cancelAllOrders(coin?: string): Promise<void> {
    // Fetch open orders then cancel them
    const address = this.vaultAddress ?? this.signer.address;
    const openOrders = await this.fetchInfo<Array<{ coin: string; oid: number }>>({
      type: "openOrders",
      user: address,
    });

    const toCancel = coin
      ? openOrders.filter((o) => o.coin === coin)
      : openOrders;

    if (toCancel.length === 0) return;

    await this.ensureAssetMap();

    const cancels = toCancel.map((o) => ({
      asset: this.getAssetIndex(o.coin),
      oid: o.oid,
    }));

    const signed = await this.signer.signCancel(cancels, this.vaultAddress);

    await fetch(`${this.baseUrl}/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    });
  }

  async modifyOrder(orderId: string, newPrice: number, newSize: number): Promise<void> {
    // Hyperliquid doesn't have a native modify - cancel and replace
    // This is a simplified approach; a real implementation would use batch operations
    throw new Error("modifyOrder: use cancel + place instead");
  }

  async setLeverage(asset: number, leverage: number, isCross: boolean): Promise<void> {
    const signed = await this.signer.signSetLeverage(asset, isCross, leverage, this.vaultAddress);

    const res = await fetch(`${this.baseUrl}/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    });

    const data = await res.json();
    if (data.status === "err") {
      throw new Error(`Set leverage failed: ${data.response}`);
    }
  }

  async getAccountState(): Promise<AccountState> {
    const address = this.vaultAddress ?? this.signer.address;

    const state = await this.fetchInfo<{
      marginSummary: {
        accountValue: string;
        totalMarginUsed: string;
        totalRawUsd: string;
      };
      assetPositions: Array<{
        position: {
          coin: string;
          szi: string;
          entryPx: string;
          unrealizedPnl: string;
          liquidationPx: string | null;
          leverage: { value: number };
          marginUsed: string;
        };
      }>;
    }>({
      type: "clearinghouseState",
      user: address,
    });

    const equity = parseFloat(state.marginSummary.accountValue);
    const totalMarginUsed = parseFloat(state.marginSummary.totalMarginUsed);

    const positions: AccountPosition[] = state.assetPositions
      .filter((ap) => parseFloat(ap.position.szi) !== 0)
      .map((ap) => ({
        coin: ap.position.coin,
        size: parseFloat(ap.position.szi),
        entryPrice: parseFloat(ap.position.entryPx),
        unrealizedPnl: parseFloat(ap.position.unrealizedPnl),
        liquidationPrice: ap.position.liquidationPx ? parseFloat(ap.position.liquidationPx) : null,
        leverage: ap.position.leverage.value,
        marginUsed: parseFloat(ap.position.marginUsed),
      }));

    return {
      equity,
      availableBalance: equity - totalMarginUsed,
      totalMarginUsed,
      positions,
    };
  }

  async getRecentFills(startTime?: number): Promise<FillEvent[]> {
    const address = this.vaultAddress ?? this.signer.address;

    const fills = await this.fetchInfo<Array<{
      oid: number;
      coin: string;
      side: "A" | "B";
      sz: string;
      px: string;
      fee: string;
      time: number;
      closedPnl: string;
    }>>(
      startTime
        ? { type: "userFillsByTime", user: address, startTime }
        : { type: "userFills", user: address },
    );

    return fills.map((f) => ({
      orderId: String(f.oid),
      coin: f.coin,
      side: f.side === "B" ? ("buy" as const) : ("sell" as const),
      size: parseFloat(f.sz),
      price: parseFloat(f.px),
      fee: parseFloat(f.fee),
      timestamp: f.time,
      closedPnl: parseFloat(f.closedPnl),
    }));
  }

  private async fetchInfo<T>(payload: object): Promise<T> {
    const res = await fetch(`${this.baseUrl}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Hyperliquid API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async refreshAssetMap(): Promise<void> {
    this.assetMap.clear();
    await this.ensureAssetMap();
  }

  private async ensureAssetMap(): Promise<void> {
    if (this.assetMap.size > 0) return;

    const meta = await this.fetchInfo<{ universe: Array<{ name: string; szDecimals: number }> }>({
      type: "meta",
    });

    meta.universe.forEach((asset, index) => {
      this.assetMap.set(asset.name, {
        name: asset.name,
        szDecimals: asset.szDecimals,
        index,
      });
    });
  }

  private getAssetIndex(coin: string): number {
    const asset = this.assetMap.get(coin);
    if (!asset) throw new Error(`Unknown asset: ${coin}`);
    return asset.index;
  }

  private getMarketSlippagePrice(side: "buy" | "sell"): number {
    // For market orders, use a far-away price to ensure fill
    // Hyperliquid will fill at the best available price
    return side === "buy" ? 999_999_999 : 0.0001;
  }
}
