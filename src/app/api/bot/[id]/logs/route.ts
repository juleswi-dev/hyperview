import { NextResponse } from "next/server";
import { getBot } from "@/lib/bot/persistence/botRepo";
import { getLogsByBot } from "@/lib/bot/persistence/tradeRepo";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const bot = getBot(id);

    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const logs = getLogsByBot(id, limit, offset);
    return NextResponse.json({ logs, limit, offset });
  } catch (error) {
    console.error("Failed to get logs:", error);
    return NextResponse.json({ error: "Failed to get logs" }, { status: 500 });
  }
}
