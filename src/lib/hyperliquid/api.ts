import type {
  AssetMeta,
  AssetCtx,
  L2Book,
  Candle,
  Fill,
  ClearinghouseState,
  FundingRate,
} from "@/types/hyperliquid";
import { cachedFetch } from "@/lib/cache";
import { acquireToken } from "@/lib/rateLimit";

const BASE_URL = "https://api.hyperliquid.xyz";

async function fetchInfo<T>(payload: object): Promise<T> {
  await acquireToken();

  const res = await fetch(`${BASE_URL}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

// Meta & Asset Context
export async function getMeta(): Promise<{
  universe: AssetMeta[];
}> {
  return cachedFetch("meta", () => fetchInfo({ type: "meta" }), 60_000);
}

export async function getMetaAndAssetCtxs(): Promise<
  [{ universe: AssetMeta[] }, AssetCtx[]]
> {
  return cachedFetch(
    "metaAndAssetCtxs",
    () => fetchInfo({ type: "metaAndAssetCtxs" }),
    55_000,  // slightly less than 60s refresh interval to avoid stale edge case
  );
}

// Prices
export async function getAllMids(): Promise<Record<string, string>> {
  return fetchInfo({ type: "allMids" });
}

// Order Book
export async function getL2Book(coin: string, nSigFigs?: number): Promise<L2Book> {
  return cachedFetch(
    `l2Book:${coin}:${nSigFigs ?? ""}`,
    () => fetchInfo({
      type: "l2Book",
      coin,
      ...(nSigFigs && { nSigFigs }),
    }),
    10_000,
  );
}

// Candles
export async function getCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime?: number
): Promise<Candle[]> {
  // Round startTime to 30s granularity so near-identical requests share cache
  const roundedStart = Math.floor(startTime / 30_000) * 30_000;
  const roundedEnd = endTime ? Math.floor(endTime / 30_000) * 30_000 : "";
  return cachedFetch(
    `candles:${coin}:${interval}:${roundedStart}:${roundedEnd}`,
    () => fetchInfo({
      type: "candleSnapshot",
      req: {
        coin,
        interval,
        startTime,
        ...(endTime && { endTime }),
      },
    }),
    30_000,
  );
}

// User Fills
export async function getUserFills(user: string): Promise<Fill[]> {
  return fetchInfo({ type: "userFills", user });
}

export async function getUserFillsByTime(
  user: string,
  startTime: number,
  endTime?: number
): Promise<Fill[]> {
  return fetchInfo({
    type: "userFillsByTime",
    user,
    startTime,
    ...(endTime && { endTime }),
  });
}

/**
 * Paginated fetch of user fills by time.
 * Hyperliquid returns max 500 fills per response. If the response has 500,
 * we fetch again from the last fill's timestamp until we get <500 results.
 */
export async function getUserFillsByTimePaginated(
  user: string,
  startTime: number,
  endTime?: number
): Promise<Fill[]> {
  const PAGE_SIZE = 500;
  const allFills: Fill[] = [];
  let cursor = startTime;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await getUserFillsByTime(user, cursor, endTime);
    allFills.push(...page);

    if (page.length < PAGE_SIZE) break;

    // Move cursor past the last fill to avoid duplicates
    const lastTime = page[page.length - 1].time;
    if (lastTime <= cursor) break; // safety: prevent infinite loop
    cursor = lastTime;
  }

  // Deduplicate by hash in case of overlapping timestamps
  const seen = new Set<string>();
  return allFills.filter((f) => {
    if (seen.has(f.hash)) return false;
    seen.add(f.hash);
    return true;
  });
}

// Clearinghouse State (User Positions)
export async function getClearinghouseState(
  user: string
): Promise<ClearinghouseState> {
  return fetchInfo({ type: "clearinghouseState", user });
}

// Funding History
export async function getFundingHistory(
  coin: string,
  startTime: number,
  endTime?: number
): Promise<FundingRate[]> {
  return fetchInfo({
    type: "fundingHistory",
    coin,
    startTime,
    ...(endTime && { endTime }),
  });
}

// Predicted Funding Rates
export async function getPredictedFundings(): Promise<
  Array<[{ coin: string }, string, string]>
> {
  return fetchInfo({ type: "predictedFundings" });
}

// Recent Trades
export async function getRecentTrades(coin: string): Promise<
  Array<{
    coin: string;
    side: "A" | "B";
    px: string;
    sz: string;
    time: number;
    hash: string;
    tid: number;
  }>
> {
  return cachedFetch(
    `recentTrades:${coin}`,
    () => fetchInfo({ type: "recentTrades", coin }),
    10_000,
  );
}

// HLP Vault Address
export const HLP_VAULT_ADDRESS = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

// Get HLP Vault Fills (for liquidation tracking)
export async function getHLPFills(): Promise<Fill[]> {
  return getUserFills(HLP_VAULT_ADDRESS);
}

export async function getHLPFillsByTime(
  startTime: number,
  endTime?: number
): Promise<Fill[]> {
  return getUserFillsByTimePaginated(HLP_VAULT_ADDRESS, startTime, endTime);
}

// API object for convenience
export const api = {
  getMeta,
  getMetaAndAssetCtxs,
  getAllMids,
  getL2Book,
  getCandles,
  getUserFills,
  getUserFillsByTime,
  getUserFillsByTimePaginated,
  getClearinghouseState,
  getFundingHistory,
  getPredictedFundings,
  getRecentTrades,
  getHLPFills,
  getHLPFillsByTime,
};
