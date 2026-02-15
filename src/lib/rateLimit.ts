/**
 * Client-side token-bucket rate limiter for Hyperliquid API.
 *
 * Hyperliquid allows 100 tokens with 10 tokens/sec regeneration.
 * We use conservative defaults (80 tokens, 9/sec) to leave headroom.
 */

const MAX_TOKENS = 80;
const REFILL_RATE = 9; // tokens per second
const REFILL_INTERVAL = 100; // ms

let tokens = MAX_TOKENS;
let lastRefill = Date.now();
const queue: Array<{ resolve: () => void }> = [];
let draining = false;

function refill() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  tokens = Math.min(MAX_TOKENS, tokens + (elapsed / 1000) * REFILL_RATE);
  lastRefill = now;
}

function drain() {
  if (draining) return;
  draining = true;

  const tick = () => {
    refill();
    while (queue.length > 0 && tokens >= 1) {
      tokens -= 1;
      queue.shift()!.resolve();
    }
    if (queue.length > 0) {
      setTimeout(tick, REFILL_INTERVAL);
    } else {
      draining = false;
    }
  };

  tick();
}

/**
 * Acquire a rate-limit token. Resolves immediately if tokens are available,
 * otherwise waits until a token is refilled.
 */
export function acquireToken(): Promise<void> {
  refill();
  if (tokens >= 1) {
    tokens -= 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push({ resolve });
    drain();
  });
}
