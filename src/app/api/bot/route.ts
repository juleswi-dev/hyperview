import { NextResponse } from "next/server";
import { listBots, createBot } from "@/lib/bot/persistence/botRepo";
import { createBotSchema } from "@/lib/bot/validation";
import { strategyRegistry } from "@/lib/bot/strategies/registry";
import "@/lib/bot/strategies/init";

export async function GET() {
  try {
    const bots = listBots();
    return NextResponse.json(bots);
  } catch (error) {
    console.error("Failed to list bots:", error);
    return NextResponse.json({ error: "Failed to list bots" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createBotSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Validate strategy exists
    if (!strategyRegistry.has(data.strategyId)) {
      return NextResponse.json(
        { error: `Unknown strategy: "${data.strategyId}"` },
        { status: 400 },
      );
    }

    // Require wallet for non-paper modes
    if (data.mode !== "paper" && !data.walletId) {
      return NextResponse.json(
        { error: "Wallet required for testnet/mainnet mode" },
        { status: 400 },
      );
    }

    const bot = createBot(data);
    return NextResponse.json(bot, { status: 201 });
  } catch (error) {
    console.error("Failed to create bot:", error);
    return NextResponse.json({ error: "Failed to create bot" }, { status: 500 });
  }
}
