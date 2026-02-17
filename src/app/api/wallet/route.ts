import { NextResponse } from "next/server";
import { z } from "zod";
import { listWallets, createPrivateKeyWallet, createVaultWallet } from "@/lib/bot/wallet/WalletManager";

const createWalletSchema = z.object({
  label: z.string().min(1).max(100),
  mode: z.enum(["private_key", "vault"]),
  privateKey: z.string().min(1),
  password: z.string().min(8),
  vaultAddress: z.string().optional(),
});

export async function GET() {
  try {
    const wallets = listWallets();
    // Strip encrypted keys from response
    const safe = wallets.map(({ encryptedKey, ...rest }) => rest);
    return NextResponse.json(safe);
  } catch (error) {
    console.error("Failed to list wallets:", error);
    return NextResponse.json({ error: "Failed to list wallets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createWalletSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { label, mode, privateKey, password, vaultAddress } = parsed.data;

    let wallet;
    if (mode === "vault") {
      if (!vaultAddress) {
        return NextResponse.json({ error: "Vault address required" }, { status: 400 });
      }
      wallet = createVaultWallet(label, vaultAddress, privateKey, password);
    } else {
      wallet = createPrivateKeyWallet(label, privateKey, password);
    }

    // Don't return the encrypted key
    const { encryptedKey, ...safe } = wallet;
    return NextResponse.json(safe, { status: 201 });
  } catch (error) {
    console.error("Failed to create wallet:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create wallet" },
      { status: 500 },
    );
  }
}
