import { z } from "zod";

export const riskConfigSchema = z.object({
  maxPositionSizeUsd: z.number().positive(),
  maxLeverage: z.number().min(1).max(100),
  maxMarginUsagePercent: z.number().min(1).max(100),
  maxDrawdownPercent: z.number().min(1).max(100),
  stopLossPercent: z.number().positive().optional(),
  takeProfitPercent: z.number().positive().optional(),
  maxOpenOrders: z.number().int().min(1).max(200),
  maxDailyLossUsd: z.number().positive(),
});

export const createBotSchema = z.object({
  name: z.string().min(1).max(100),
  strategyId: z.string().min(1),
  strategyConfig: z.record(z.string(), z.unknown()),
  coins: z.array(z.string().min(1)).nonempty(),
  mode: z.enum(["paper", "testnet", "mainnet"]),
  walletId: z.string().optional(),
  riskConfig: riskConfigSchema,
  tickIntervalMs: z.number().int().min(1000).max(3_600_000).optional(),
});

export const updateBotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  strategyConfig: z.record(z.string(), z.unknown()).optional(),
  coins: z.array(z.string().min(1)).nonempty().optional(),
  riskConfig: riskConfigSchema.optional(),
  tickIntervalMs: z.number().int().min(1000).max(3_600_000).optional(),
});
