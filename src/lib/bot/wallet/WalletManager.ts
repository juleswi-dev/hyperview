import { getDb } from "../persistence/db";
import { encryptKey, decryptKey } from "./encryption";
import type { WalletConfig, WalletMode } from "@/types/bot";
import { v4 as uuidv4 } from "uuid";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

interface WalletRow {
  id: string;
  label: string;
  mode: string;
  encrypted_key: string | null;
  vault_address: string | null;
  address: string;
  created_at: number;
}

function rowToWallet(row: WalletRow): WalletConfig {
  return {
    id: row.id,
    label: row.label,
    mode: row.mode as WalletMode,
    encryptedKey: row.encrypted_key ?? undefined,
    vaultAddress: row.vault_address ?? undefined,
    address: row.address,
    createdAt: row.created_at,
  };
}

// In-memory cache of decrypted keys (cleared on server restart)
const decryptedKeys = new Map<string, Hex>();

export function listWallets(): WalletConfig[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM wallets ORDER BY created_at DESC").all() as WalletRow[];
  return rows.map(rowToWallet);
}

export function getWallet(id: string): WalletConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM wallets WHERE id = ?").get(id) as WalletRow | undefined;
  return row ? rowToWallet(row) : null;
}

export function createPrivateKeyWallet(
  label: string,
  privateKey: string,
  password: string,
): WalletConfig {
  const db = getDb();
  const id = uuidv4();

  // Derive address from private key
  const account = privateKeyToAccount(privateKey as Hex);
  const address = account.address;

  // Encrypt the private key
  const encryptedKey = encryptKey(privateKey, password);

  db.prepare(`
    INSERT INTO wallets (id, label, mode, encrypted_key, address, created_at)
    VALUES (?, ?, 'private_key', ?, ?, ?)
  `).run(id, label, encryptedKey, address, Date.now());

  // Cache the decrypted key
  decryptedKeys.set(id, privateKey as Hex);

  return getWallet(id)!;
}

export function createVaultWallet(
  label: string,
  vaultAddress: string,
  operatorKey: string,
  password: string,
): WalletConfig {
  const db = getDb();
  const id = uuidv4();

  const account = privateKeyToAccount(operatorKey as Hex);
  const address = account.address;
  const encryptedKey = encryptKey(operatorKey, password);

  db.prepare(`
    INSERT INTO wallets (id, label, mode, encrypted_key, vault_address, address, created_at)
    VALUES (?, ?, 'vault', ?, ?, ?, ?)
  `).run(id, label, encryptedKey, vaultAddress, address, Date.now());

  decryptedKeys.set(id, operatorKey as Hex);

  return getWallet(id)!;
}

export function unlockWallet(id: string, password: string): Hex {
  // Check cache first
  const cached = decryptedKeys.get(id);
  if (cached) return cached;

  const wallet = getWallet(id);
  if (!wallet) throw new Error("Wallet not found");
  if (!wallet.encryptedKey) throw new Error("No encrypted key for this wallet");

  try {
    const key = decryptKey(wallet.encryptedKey, password) as Hex;
    decryptedKeys.set(id, key);
    return key;
  } catch {
    throw new Error("Invalid password");
  }
}

export function isWalletUnlocked(id: string): boolean {
  return decryptedKeys.has(id);
}

export function getDecryptedKey(id: string): Hex {
  const key = decryptedKeys.get(id);
  if (!key) throw new Error("Wallet is locked. Please unlock with password.");
  return key;
}

export function lockWallet(id: string): void {
  decryptedKeys.delete(id);
}

export function deleteWallet(id: string): boolean {
  const db = getDb();
  decryptedKeys.delete(id);
  const result = db.prepare("DELETE FROM wallets WHERE id = ?").run(id);
  return result.changes > 0;
}
