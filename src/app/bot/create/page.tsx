"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StrategySelector } from "@/components/bot/StrategySelector";
import { ConfigForm } from "@/components/bot/ConfigForm";
import type { CreateBotRequest } from "@/types/bot";

export default function CreateBotPage() {
  const router = useRouter();
  const [step, setStep] = useState<"strategy" | "config">("strategy");
  const [strategyId, setStrategyId] = useState("dca");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStrategySelect = (id: string) => {
    setStrategyId(id);
  };

  const handleSubmit = async (config: Omit<CreateBotRequest, "strategyId">) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, strategyId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create bot");
      }

      const bot = await res.json();
      router.push(`/bot/${bot.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bot");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Create Trading Bot</h1>
      <p className="text-sm text-zinc-400 mb-8">Configure a new automated trading strategy</p>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Steps */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setStep("strategy")}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
            step === "strategy" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          1. Strategy
        </button>
        <button
          onClick={() => setStep("config")}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
            step === "config" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          2. Configure
        </button>
      </div>

      {step === "strategy" && (
        <div>
          <StrategySelector selected={strategyId} onSelect={handleStrategySelect} />
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep("config")}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
            >
              Next: Configure
            </button>
          </div>
        </div>
      )}

      {step === "config" && (
        <ConfigForm
          strategyId={strategyId}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
