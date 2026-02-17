import {
  type Hex,
  type Address,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Hyperliquid uses a custom EIP-712 domain
const MAINNET_CHAIN_ID = 1337; // Hyperliquid L1
const TESTNET_CHAIN_ID = 421614;

const HL_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: MAINNET_CHAIN_ID,
  verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
};

const TESTNET_DOMAIN = {
  ...HL_DOMAIN,
  chainId: TESTNET_CHAIN_ID,
};

// EIP-712 types for Hyperliquid Exchange actions
const ORDER_TYPE = {
  Order: [
    { name: "asset", type: "uint32" },
    { name: "isBuy", type: "bool" },
    { name: "limitPx", type: "uint64" },
    { name: "sz", type: "uint64" },
    { name: "reduceOnly", type: "bool" },
    { name: "cloid", type: "bytes16" },
  ],
} as const;

const CANCEL_TYPE = {
  Cancel: [
    { name: "asset", type: "uint32" },
    { name: "oid", type: "uint64" },
  ],
} as const;

const AGENT_TYPE = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

export interface OrderWire {
  asset: number;
  isBuy: boolean;
  limitPx: string;
  sz: string;
  reduceOnly: boolean;
  cloid?: string;
  orderType: { limit: { tif: string } } | { trigger: { triggerPx: string; isMarket: boolean; tpsl: string } };
}

export interface SignedAction {
  action: Record<string, unknown>;
  nonce: number;
  signature: { r: Hex; s: Hex; v: number };
  vaultAddress?: Address;
}

export class HyperliquidSigner {
  private account;
  private isTestnet: boolean;

  constructor(privateKey: Hex, isTestnet = false) {
    this.account = privateKeyToAccount(privateKey);
    this.isTestnet = isTestnet;
  }

  get address(): Address {
    return this.account.address;
  }

  async signOrder(orders: OrderWire[], vaultAddress?: Address): Promise<SignedAction> {
    const nonce = Date.now();
    const action = {
      type: "order",
      orders,
      grouping: "na",
    };

    const domain = this.isTestnet ? TESTNET_DOMAIN : HL_DOMAIN;

    // Sign the agent connection message (Hyperliquid's approach)
    const signature = await this.account.signTypedData({
      domain,
      types: AGENT_TYPE,
      primaryType: "Agent",
      message: {
        source: this.isTestnet ? "b" : "a",
        connectionId: this.actionHash(action, nonce),
      },
    });

    const r = `0x${signature.slice(2, 66)}` as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    return {
      action,
      nonce,
      signature: { r, s, v },
      vaultAddress,
    };
  }

  async signCancel(
    cancels: Array<{ asset: number; oid: number }>,
    vaultAddress?: Address,
  ): Promise<SignedAction> {
    const nonce = Date.now();
    const action = {
      type: "cancel",
      cancels,
    };

    const domain = this.isTestnet ? TESTNET_DOMAIN : HL_DOMAIN;

    const signature = await this.account.signTypedData({
      domain,
      types: AGENT_TYPE,
      primaryType: "Agent",
      message: {
        source: this.isTestnet ? "b" : "a",
        connectionId: this.actionHash(action, nonce),
      },
    });

    const r = `0x${signature.slice(2, 66)}` as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    return {
      action,
      nonce,
      signature: { r, s, v },
      vaultAddress,
    };
  }

  async signSetLeverage(
    asset: number,
    isCross: boolean,
    leverage: number,
    vaultAddress?: Address,
  ): Promise<SignedAction> {
    const nonce = Date.now();
    const action = {
      type: "updateLeverage",
      asset,
      isCross,
      leverage,
    };

    const domain = this.isTestnet ? TESTNET_DOMAIN : HL_DOMAIN;

    const signature = await this.account.signTypedData({
      domain,
      types: AGENT_TYPE,
      primaryType: "Agent",
      message: {
        source: this.isTestnet ? "b" : "a",
        connectionId: this.actionHash(action, nonce),
      },
    });

    const r = `0x${signature.slice(2, 66)}` as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    return {
      action,
      nonce,
      signature: { r, s, v },
      vaultAddress,
    };
  }

  private actionHash(action: Record<string, unknown>, nonce: number): Hex {
    // Hyperliquid uses keccak256 of the action + nonce as connectionId
    const payload = JSON.stringify(action) + nonce.toString();
    const encoded = toHex(new TextEncoder().encode(payload));
    return keccak256(encoded);
  }
}
