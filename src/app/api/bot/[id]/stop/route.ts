import { NextResponse } from "next/server";
import { getBot } from "@/lib/bot/persistence/botRepo";
import { botManager } from "@/lib/bot/engine/BotManager";

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

    await botManager.stopBot(id);
    return NextResponse.json({ success: true, status: "stopped" });
  } catch (error) {
    console.error("Failed to stop bot:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stop bot" },
      { status: 500 },
    );
  }
}
