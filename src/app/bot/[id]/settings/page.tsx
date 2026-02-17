"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BotConfig, RiskConfig } from "@/types/bot";

export default function BotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [bot, setBot] = useState<BotConfig | null>(null);
  const [name, setName] = useState("");
  const [risk, setRisk] = useState<RiskConfig | null>(null);
  const [tickInterval, setTickInterval] = useState(10000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/bot/${id}`)
      .then((r) => r.json())
      .then((b: BotConfig) => {
        setBot(b);
        setName(b.name);
        setRisk(b.riskConfig);
        setTickInterval(b.tickIntervalMs);
      });
  }, [id]);

  const handleSave = async () => {
    if (!risk) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/bot/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, riskConfig: risk, tickIntervalMs: tickInterval }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update");
      }

      router.push(`/bot/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!bot || !risk) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-64 flex items-center justify-center text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/bot/${id}`} className="text-zinc-500 hover:text-zinc-300 text-sm">&larr; Back</Link>
        <h1 className="text-2xl font-bold text-white">Settings: {bot.name}</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-sm">{error}</div>
      )}

      {bot.status === "running" && (
        <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-900/50 rounded-xl text-yellow-400 text-sm">
          Bot is running. Stop it before editing settings.
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Bot Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input max-w-md" disabled={bot.status === "running"} />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Tick Interval (ms)</label>
          <input type="number" value={tickInterval} onChange={(e) => setTickInterval(+e.target.value)} min={1000} className="input max-w-md" disabled={bot.status === "running"} />
        </div>

        <div className="border border-zinc-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4">Risk Management</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Max Position (USD)">
              <input type="number" value={risk.maxPositionSizeUsd} onChange={(e) => setRisk({ ...risk, maxPositionSizeUsd: +e.target.value })} className="input" disabled={bot.status === "running"} />
            </Field>
            <Field label="Max Leverage">
              <input type="number" value={risk.maxLeverage} onChange={(e) => setRisk({ ...risk, maxLeverage: +e.target.value })} className="input" disabled={bot.status === "running"} />
            </Field>
            <Field label="Max Margin (%)">
              <input type="number" value={risk.maxMarginUsagePercent} onChange={(e) => setRisk({ ...risk, maxMarginUsagePercent: +e.target.value })} className="input" disabled={bot.status === "running"} />
            </Field>
            <Field label="Max Drawdown (%)">
              <input type="number" value={risk.maxDrawdownPercent} onChange={(e) => setRisk({ ...risk, maxDrawdownPercent: +e.target.value })} className="input" disabled={bot.status === "running"} />
            </Field>
            <Field label="Max Open Orders">
              <input type="number" value={risk.maxOpenOrders} onChange={(e) => setRisk({ ...risk, maxOpenOrders: +e.target.value })} className="input" disabled={bot.status === "running"} />
            </Field>
            <Field label="Max Daily Loss (USD)">
              <input type="number" value={risk.maxDailyLossUsd} onChange={(e) => setRisk({ ...risk, maxDailyLossUsd: +e.target.value })} className="input" disabled={bot.status === "running"} />
            </Field>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || bot.status === "running"}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
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
