import { NextResponse } from "next/server";
import { getAggregateStats, getAllBotStats } from "@/lib/bot/persistence/statsRepo";

export async function GET() {
  try {
    const aggregate = getAggregateStats();
    const botStats = getAllBotStats();
    return NextResponse.json({ aggregate, botStats });
  } catch (error) {
    console.error("Failed to get statistics:", error);
    return NextResponse.json({ error: "Failed to get statistics" }, { status: 500 });
  }
}
