import type {
  ExchangeClient,
  OrderRequest,
  CancelRequest,
  FillEvent,
  AccountState,
  AccountPosition,
} from "@/types/exchange";
import { v4 as uuidv4 } from "uuid";

const TAKER_FEE = 0.00025; // 0.025%
const MAKER_FEE = 0.0001;  // 0.01%
const SLIPPAGE = 0.0005;   // 0.05%

interface PaperPosition {
  coin: string;
  size: number;       // positive = long, negative = short
  entryPrice: number;
  marginUsed: number;
}

interface PaperLimitOrder {
  id: string;
  coin: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  reduceOnly: boolean;
  createdAt: number;
}

export class PaperExchangeClient implements ExchangeClient {
  readonly mode = "paper" as const;

  private equity: number;
  private positions = new Map<string, PaperPosition>();
  private limitOrders = new Map<string, PaperLimitOrder>();
  private fills: FillEvent[] = [];
  private leverage = 10;
  private getMidPrice: (coin: string) => number | null;

  constructor(
    startingEquity: number,
    getMidPrice: (coin: string) => number | null,
  ) {
    this.equity = startingEquity;
    this.getMidPrice = getMidPrice;
  }

  async placeOrder(order: OrderRequest): Promise<string> {
    const orderId = uuidv4();

    if (order.orderType === "market") {
      this.executeMarketOrder(orderId, order);
    } else {
      // Store limit order for later matching
      this.limitOrders.set(orderId, {
        id: orderId,
        coin: order.coin,
        side: order.side,
        size: order.size,
        price: order.price!,
        reduceOnly: order.reduceOnly ?? false,
        createdAt: Date.now(),
      });
    }

    return orderId;
  }

  async cancelOrder(cancel: CancelRequest): Promise<void> {
    this.limitOrders.delete(cancel.orderId);
  }

  async cancelAllOrders(coin?: string): Promise<void> {
    if (coin) {
      for (const [id, order] of this.limitOrders) {
        if (order.coin === coin) this.limitOrders.delete(id);
      }
    } else {
      this.limitOrders.clear();
    }
  }

  async modifyOrder(orderId: string, newPrice: number, newSize: number): Promise<void> {
    const order = this.limitOrders.get(orderId);
    if (order) {
      order.price = newPrice;
      order.size = newSize;
    }
  }

  async setLeverage(_asset: number, leverage: number, _isCross: boolean): Promise<void> {
    this.leverage = leverage;
  }

  async getAccountState(): Promise<AccountState> {
    let totalMarginUsed = 0;
    let unrealizedPnl = 0;
    const positions: AccountPosition[] = [];

    for (const pos of this.positions.values()) {
      const midPrice = this.getMidPrice(pos.coin);
      if (!midPrice) continue;

      const pnl = pos.size * (midPrice - pos.entryPrice);
      unrealizedPnl += pnl;
      totalMarginUsed += pos.marginUsed;

      positions.push({
        coin: pos.coin,
        size: pos.size,
        entryPrice: pos.entryPrice,
        unrealizedPnl: pnl,
        liquidationPrice: this.calcLiqPrice(pos),
        leverage: this.leverage,
        marginUsed: pos.marginUsed,
      });
    }

    const currentEquity = this.equity + unrealizedPnl;

    return {
      equity: currentEquity,
      availableBalance: currentEquity - totalMarginUsed,
      totalMarginUsed,
      positions,
    };
  }

  async getRecentFills(startTime?: number): Promise<FillEvent[]> {
    if (!startTime) return this.fills.slice(-100);
    return this.fills.filter((f) => f.timestamp >= startTime);
  }

  /**
   * Called by BotRunner on each tick to check if any limit orders should fill.
   */
  checkLimitOrders(): FillEvent[] {
    const newFills: FillEvent[] = [];

    for (const [id, order] of this.limitOrders) {
      const midPrice = this.getMidPrice(order.coin);
      if (!midPrice) continue;

      const shouldFill =
        (order.side === "buy" && midPrice <= order.price) ||
        (order.side === "sell" && midPrice >= order.price);

      if (shouldFill) {
        const fill = this.executeLimitFill(id, order, order.price);
        if (fill) newFills.push(fill);
      }
    }

    return newFills;
  }

  getEquity(): number {
    return this.equity;
  }

  private executeMarketOrder(orderId: string, order: OrderRequest): void {
    const midPrice = this.getMidPrice(order.coin);
    if (!midPrice) {
      throw new Error(`No price available for ${order.coin}`);
    }

    // BUG 5: Check reduceOnly - if set, order must reduce or close existing position
    if (order.reduceOnly) {
      const pos = this.positions.get(order.coin);
      if (!pos) return; // No position to reduce
      // Buy reduces short, sell reduces long
      if (order.side === "buy" && pos.size >= 0) return;
      if (order.side === "sell" && pos.size <= 0) return;
    }

    // Apply slippage
    const fillPrice =
      order.side === "buy"
        ? midPrice * (1 + SLIPPAGE)
        : midPrice * (1 - SLIPPAGE);

    const fee = order.size * fillPrice * TAKER_FEE;
    const closedPnl = this.updatePosition(order.coin, order.side, order.size, fillPrice);
    this.equity -= fee;
    this.equity += closedPnl;

    const fill: FillEvent = {
      orderId,
      coin: order.coin,
      side: order.side,
      size: order.size,
      price: fillPrice,
      fee,
      timestamp: Date.now(),
      closedPnl,
    };

    this.fills.push(fill);
    // Keep fills bounded
    if (this.fills.length > 10000) {
      this.fills = this.fills.slice(-5000);
    }
  }

  private executeLimitFill(orderId: string, order: PaperLimitOrder, fillPrice: number): FillEvent | null {
    this.limitOrders.delete(orderId);

    // BUG 5: Check reduceOnly for limit orders too
    if (order.reduceOnly) {
      const pos = this.positions.get(order.coin);
      if (!pos) return null;
      if (order.side === "buy" && pos.size >= 0) return null;
      if (order.side === "sell" && pos.size <= 0) return null;
    }

    const fee = order.size * fillPrice * MAKER_FEE;
    const closedPnl = this.updatePosition(order.coin, order.side, order.size, fillPrice);
    this.equity -= fee;
    this.equity += closedPnl;

    const fill: FillEvent = {
      orderId,
      coin: order.coin,
      side: order.side,
      size: order.size,
      price: fillPrice,
      fee,
      timestamp: Date.now(),
      closedPnl,
    };

    this.fills.push(fill);
    return fill;
  }

  private updatePosition(
    coin: string,
    side: "buy" | "sell",
    size: number,
    price: number,
  ): number {
    const existing = this.positions.get(coin);
    const signedSize = side === "buy" ? size : -size;
    let closedPnl = 0;

    if (!existing) {
      // New position
      const notional = Math.abs(signedSize) * price;
      this.positions.set(coin, {
        coin,
        size: signedSize,
        entryPrice: price,
        marginUsed: notional / this.leverage,
      });
    } else {
      const newSize = existing.size + signedSize;

      // Check if closing or reducing
      if (Math.sign(existing.size) !== Math.sign(signedSize)) {
        // Closing (partially or fully)
        const closingSize = Math.min(Math.abs(signedSize), Math.abs(existing.size));
        closedPnl = closingSize * (price - existing.entryPrice) * Math.sign(existing.size);
      }

      if (Math.abs(newSize) < 0.0000001) {
        // Fully closed
        this.positions.delete(coin);
      } else if (Math.sign(newSize) === Math.sign(existing.size)) {
        // Same direction: average entry
        const totalCost = existing.size * existing.entryPrice + signedSize * price;
        existing.entryPrice = totalCost / newSize;
        existing.size = newSize;
        existing.marginUsed = Math.abs(newSize) * existing.entryPrice / this.leverage;
      } else {
        // Flipped direction
        const notional = Math.abs(newSize) * price;
        existing.size = newSize;
        existing.entryPrice = price;
        existing.marginUsed = notional / this.leverage;
      }
    }

    return closedPnl;
  }

  private calcLiqPrice(pos: PaperPosition): number | null {
    if (pos.size === 0) return null;
    const maintenanceMargin = 1 / (this.leverage * 2);
    if (pos.size > 0) {
      return pos.entryPrice * (1 - maintenanceMargin);
    } else {
      return pos.entryPrice * (1 + maintenanceMargin);
    }
  }
}
