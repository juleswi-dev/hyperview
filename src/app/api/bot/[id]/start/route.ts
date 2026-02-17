import { NextResponse } from "next/server";
import { getBot } from "@/lib/bot/persistence/botRepo";
import { botManager } from "@/lib/bot/engine/BotManager";
import "@/lib/bot/strategies/init";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const bot = getBot(id);

    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    if (bot.status === "running") {
      return NextResponse.json({ error: "Bot is already running" }, { status: 409 });
    }

    await botManager.startBot(id);
    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    console.error("Failed to start bot:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start bot" },
      { status: 500 },
    );
  }
}
