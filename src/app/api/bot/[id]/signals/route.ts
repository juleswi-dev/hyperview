import { NextResponse } from "next/server";
import { getBot } from "@/lib/bot/persistence/botRepo";
import { liquidationFeed } from "@/lib/bot/feeds/LiquidationFeed";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const bot = getBot(id);

    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    if (bot.strategyId !== "liquidation-sniper") {
      return NextResponse.json({ error: "Not a sniper bot" }, { status: 400 });
    }

    const coins: string[] = (bot.strategyConfig.coins as string[]) ?? bot.coins;

    // Get signals for all configured coins
    const allSignals = coins.flatMap((coin) =>
      liquidationFeed.getRecentLiquidations(coin, 86_400_000), // Last 24h
    );

    // Deduplicate and sort by time desc
    const seen = new Set<string>();
    const signals = allSignals
      .filter((s) => {
        if (seen.has(s.hash)) return false;
        seen.add(s.hash);
        return true;
      })
      .sort((a, b) => b.time - a.time)
      .slice(0, 100);

    // Compute stats
    const minValue = (bot.strategyConfig.minLiquidationValueUsd as number) ?? 50_000;
    const qualifying = signals.filter((s) => s.value >= minValue);
    const confirmed = signals.filter((s) => s.isConfirmed);

    // Strategy state for acted-on stats
    const stratState = bot.strategyState ?? {};
    const signalsActedOn = (stratState.signalsActedOn as number) ?? 0;
    const signalsDetected = (stratState.signalsDetected as number) ?? 0;

    return NextResponse.json({
      signals,
      stats: {
        totalDetected: signalsDetected,
        totalActedOn: signalsActedOn,
        qualifyingLast24h: qualifying.length,
        confirmedLast24h: confirmed.length,
        feedRunning: liquidationFeed.isRunning(),
        consumerCount: liquidationFeed.getConsumerCount(),
      },
    });
  } catch (error) {
    console.error("Failed to get signals:", error);
    return NextResponse.json({ error: "Failed to get signals" }, { status: 500 });
  }
}
