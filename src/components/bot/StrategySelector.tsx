"use client";

import clsx from "clsx";

interface StrategyOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const strategies: StrategyOption[] = [
  {
    id: "dca",
    name: "DCA",
    description: "Dollar Cost Averaging - periodically buy fixed USD amounts with optional dip buying",
    icon: "DCA",
  },
  {
    id: "grid",
    name: "Grid Trading",
    description: "Place buy/sell orders at regular price intervals to profit from range-bound markets",
    icon: "GRID",
  },
  {
    id: "liquidation-sniper",
    name: "Liquidation Sniper",
    description: "Enter positions after large liquidation events to catch post-liquidation price bounces",
    icon: "SNIPE",
  },
];

interface StrategySelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

export function StrategySelector({ selected, onSelect }: StrategySelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {strategies.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={clsx(
            "text-left p-5 rounded-xl border transition-all",
            selected === s.id
              ? "border-blue-500 bg-blue-900/20"
              : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600",
          )}
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-1 text-xs font-mono font-bold bg-zinc-700 rounded text-zinc-300">
              {s.icon}
            </span>
            <span className="font-semibold text-white">{s.name}</span>
          </div>
          <p className="text-sm text-zinc-400">{s.description}</p>
        </button>
      ))}
    </div>
  );
}
