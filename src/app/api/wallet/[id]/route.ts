import { NextResponse } from "next/server";
import { getWallet, deleteWallet } from "@/lib/bot/wallet/WalletManager";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const wallet = getWallet(id);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const { encryptedKey, ...safe } = wallet;
    return NextResponse.json(safe);
  } catch (error) {
    console.error("Failed to get wallet:", error);
    return NextResponse.json({ error: "Failed to get wallet" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = deleteWallet(id);

    if (!deleted) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete wallet:", error);
    return NextResponse.json({ error: "Failed to delete wallet" }, { status: 500 });
  }
}
