"use client";

import { useState } from "react";
import type { RiskConfig, TradingMode } from "@/types/bot";

interface ConfigFormProps {
  strategyId: string;
  onSubmit: (config: {
    name: string;
    strategyConfig: Record<string, unknown>;
    coins: string[];
    mode: TradingMode;
    riskConfig: RiskConfig;
    tickIntervalMs: number;
  }) => void;
  isSubmitting: boolean;
}

const defaultRisk: RiskConfig = {
  maxPositionSizeUsd: 5000,
  maxLeverage: 10,
  maxMarginUsagePercent: 80,
  maxDrawdownPercent: 20,
  maxOpenOrders: 50,
  maxDailyLossUsd: 1000,
};

export function ConfigForm({ strategyId, onSubmit, isSubmitting }: ConfigFormProps) {
  const [name, setName] = useState("");
  const [coin, setCoin] = useState("BTC");
  const [mode, setMode] = useState<TradingMode>("paper");
  const [risk, setRisk] = useState<RiskConfig>(defaultRisk);

  // DCA-specific
  const [dcaAmount, setDcaAmount] = useState(100);
  const [dcaInterval, setDcaInterval] = useState(3600000); // 1h
  const [dcaMaxInvestment, setDcaMaxInvestment] = useState(10000);

  // Grid-specific
  const [gridLevels, setGridLevels] = useState(10);
  const [gridSpacing, setGridSpacing] = useState(1);
  const [gridInvestment, setGridInvestment] = useState(5000);

  // Liquidation Sniper-specific
  const [sniperMinValue, setSniperMinValue] = useState(100000);
  const [sniperEntryOffset, setSniperEntryOffset] = useState(0.5);
  const [sniperTakeProfit, setSniperTakeProfit] = useState(2);
  const [sniperStopLoss, setSniperStopLoss] = useState(1);
  const [sniperPositionSize, setSniperPositionSize] = useState(5);
  const [sniperMaxPositions, setSniperMaxPositions] = useState(3);
  const [sniperCooldown, setSniperCooldown] = useState(30);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let strategyConfig: Record<string, unknown>;
    let tickIntervalMs: number;

    switch (strategyId) {
      case "dca":
        strategyConfig = {
          coin,
          amountUsd: dcaAmount,
          intervalMs: dcaInterval,
          maxTotalInvestmentUsd: dcaMaxInvestment,
        };
        tickIntervalMs = 60_000;
        break;
      case "grid":
        strategyConfig = {
          coin,
          gridLevels,
          gridSpacingPercent: gridSpacing,
          totalInvestmentUsd: gridInvestment,
        };
        tickIntervalMs = 10_000;
        break;
      case "liquidation-sniper":
        strategyConfig = {
          coins: [coin],
          minLiquidationValueUsd: sniperMinValue,
          entryOffsetPercent: sniperEntryOffset,
          takeProfitPercent: sniperTakeProfit,
          stopLossPercent: sniperStopLoss,
          positionSizePercent: sniperPositionSize,
          maxConcurrentPositions: sniperMaxPositions,
          cooldownMs: sniperCooldown * 1_000,
        };
        tickIntervalMs = 2_000;
        break;
      default:
        strategyConfig = {};
        tickIntervalMs = 10_000;
    }

    onSubmit({
      name,
      strategyConfig,
      coins: [coin],
      mode,
      riskConfig: risk,
      tickIntervalMs,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Bot Name">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My DCA Bot"
            className="input"
          />
        </Field>
        <Field label="Coin">
          <input
            type="text"
            required
            value={coin}
            onChange={(e) => setCoin(e.target.value.toUpperCase())}
            placeholder="BTC"
            className="input"
          />
        </Field>
        <Field label="Mode">
          <select value={mode} onChange={(e) => setMode(e.target.value as TradingMode)} className="input">
            <option value="paper">Paper Trading</option>
            <option value="testnet">Testnet</option>
            <option value="mainnet">Mainnet</option>
          </select>
        </Field>
      </div>

      {/* Strategy-specific config */}
      <div className="border border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Strategy Configuration</h3>

        {strategyId === "dca" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Amount per Buy (USD)">
              <input type="number" min={1} value={dcaAmount} onChange={(e) => setDcaAmount(+e.target.value)} className="input" />
            </Field>
            <Field label="Interval">
              <select value={dcaInterval} onChange={(e) => setDcaInterval(+e.target.value)} className="input">
                <option value={60000}>Every Minute</option>
                <option value={3600000}>Hourly</option>
                <option value={86400000}>Daily</option>
                <option value={604800000}>Weekly</option>
              </select>
            </Field>
            <Field label="Max Total Investment (USD)">
              <input type="number" min={1} value={dcaMaxInvestment} onChange={(e) => setDcaMaxInvestment(+e.target.value)} className="input" />
            </Field>
          </div>
        )}

        {strategyId === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Grid Levels">
              <input type="number" min={3} max={50} value={gridLevels} onChange={(e) => setGridLevels(+e.target.value)} className="input" />
            </Field>
            <Field label="Grid Spacing (%)">
              <input type="number" min={0.1} step={0.1} value={gridSpacing} onChange={(e) => setGridSpacing(+e.target.value)} className="input" />
            </Field>
            <Field label="Total Investment (USD)">
              <input type="number" min={100} value={gridInvestment} onChange={(e) => setGridInvestment(+e.target.value)} className="input" />
            </Field>
          </div>
        )}

        {strategyId === "liquidation-sniper" && (
          <div className="space-y-5">
            {/* Signal Settings */}
            <div>
              <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Signal Filter</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Field label="Min Liq Value (USD)">
                  <input type="number" min={1000} step={1000} value={sniperMinValue} onChange={(e) => setSniperMinValue(+e.target.value)} className="input" />
                </Field>
                <Field label="Entry Offset (%)">
                  <input type="number" min={0} step={0.1} value={sniperEntryOffset} onChange={(e) => setSniperEntryOffset(+e.target.value)} className="input" />
                </Field>
                <Field label="Take Profit (%)">
                  <input type="number" min={0.1} step={0.1} value={sniperTakeProfit} onChange={(e) => setSniperTakeProfit(+e.target.value)} className="input" />
                </Field>
                <Field label="Stop Loss (%)">
                  <input type="number" min={0.1} step={0.1} value={sniperStopLoss} onChange={(e) => setSniperStopLoss(+e.target.value)} className="input" />
                </Field>
              </div>
            </div>

            {/* Position Sizing */}
            <div>
              <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Position Sizing</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Size per Trade (% of Equity)">
                  <input type="number" min={0.5} max={50} step={0.5} value={sniperPositionSize} onChange={(e) => setSniperPositionSize(+e.target.value)} className="input" />
                </Field>
                <Field label="Max Concurrent Positions">
                  <input type="number" min={1} max={20} value={sniperMaxPositions} onChange={(e) => setSniperMaxPositions(+e.target.value)} className="input" />
                </Field>
                <Field label="Cooldown Between Trades (sec)">
                  <input type="number" min={0} step={5} value={sniperCooldown} onChange={(e) => setSniperCooldown(+e.target.value)} className="input" />
                </Field>
              </div>
              {/* Preview */}
              <div className="mt-3 px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                <p className="text-xs text-zinc-400">
                  Bei <span className="text-white font-medium">$10,000</span> Equity →{" "}
                  <span className="text-blue-400 font-medium">${(10000 * sniperPositionSize / 100).toLocaleString()}</span> pro Trade,{" "}
                  max <span className="text-white font-medium">{sniperMaxPositions}</span> gleichzeitig{" "}
                  = max <span className="text-amber-400 font-medium">${(10000 * sniperPositionSize / 100 * sniperMaxPositions).toLocaleString()}</span> Exposure
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Risk Config */}
      <div className="border border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Risk Management</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Max Position (USD)">
            <input type="number" min={1} value={risk.maxPositionSizeUsd} onChange={(e) => setRisk({ ...risk, maxPositionSizeUsd: +e.target.value })} className="input" />
          </Field>
          <Field label="Max Leverage">
            <input type="number" min={1} max={100} value={risk.maxLeverage} onChange={(e) => setRisk({ ...risk, maxLeverage: +e.target.value })} className="input" />
          </Field>
          <Field label="Max Margin Usage (%)">
            <input type="number" min={1} max={100} value={risk.maxMarginUsagePercent} onChange={(e) => setRisk({ ...risk, maxMarginUsagePercent: +e.target.value })} className="input" />
          </Field>
          <Field label="Max Drawdown (%)">
            <input type="number" min={1} max={100} value={risk.maxDrawdownPercent} onChange={(e) => setRisk({ ...risk, maxDrawdownPercent: +e.target.value })} className="input" />
          </Field>
          <Field label="Max Open Orders">
            <input type="number" min={1} max={200} value={risk.maxOpenOrders} onChange={(e) => setRisk({ ...risk, maxOpenOrders: +e.target.value })} className="input" />
          </Field>
          <Field label="Max Daily Loss (USD)">
            <input type="number" min={1} value={risk.maxDailyLossUsd} onChange={(e) => setRisk({ ...risk, maxDailyLossUsd: +e.target.value })} className="input" />
          </Field>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !name}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? "Creating..." : "Create Bot"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
