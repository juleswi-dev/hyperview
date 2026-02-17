import { NextResponse } from "next/server";
import { getBot, updateBot, deleteBot } from "@/lib/bot/persistence/botRepo";
import { updateBotSchema } from "@/lib/bot/validation";

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

    return NextResponse.json(bot);
  } catch (error) {
    console.error("Failed to get bot:", error);
    return NextResponse.json({ error: "Failed to get bot" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const existing = getBot(id);

    if (!existing) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    if (existing.status === "running") {
      return NextResponse.json(
        { error: "Cannot update a running bot. Stop it first." },
        { status: 409 },
      );
    }

    const body = await request.json();
    const parsed = updateBotSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = updateBot(id, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update bot:", error);
    return NextResponse.json({ error: "Failed to update bot" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const existing = getBot(id);

    if (!existing) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    if (existing.status === "running") {
      return NextResponse.json(
        { error: "Cannot delete a running bot. Stop it first." },
        { status: 409 },
      );
    }

    deleteBot(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete bot:", error);
    return NextResponse.json({ error: "Failed to delete bot" }, { status: 500 });
  }
}
