import type { OrderRequest, ExchangeClient } from "@/types/exchange";

interface QueuedOrder {
  order: OrderRequest;
  resolve: (orderId: string) => void;
  reject: (error: Error) => void;
  retries: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class OrderQueue {
  private queue: QueuedOrder[] = [];
  private processing = false;
  private client: ExchangeClient;

  constructor(client: ExchangeClient) {
    this.client = client;
  }

  enqueue(order: OrderRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ order, resolve, reject, retries: 0 });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue.shift()!;

    try {
      const orderId = await this.client.placeOrder(item.order);
      item.resolve(orderId);
    } catch (error) {
      if (item.retries < MAX_RETRIES) {
        item.retries++;
        // Re-add to front of queue after delay
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * item.retries));
        this.queue.unshift(item);
      } else {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing = false;
    this.processNext();
  }

  clear(): void {
    for (const item of this.queue) {
      item.reject(new Error("Queue cleared"));
    }
    this.queue = [];
  }

  get length(): number {
    return this.queue.length;
  }
}
