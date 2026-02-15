"use client";

import React from "react";
import clsx from "clsx";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  icon?: React.ReactNode;
  color?: "default" | "green" | "red" | "orange" | "blue";
}

export const StatsCard = React.memo(function StatsCard({
  title,
  value,
  subtitle,
  change,
  icon,
  color = "default",
}: StatsCardProps) {
  const colorClasses = {
    default: "from-zinc-800 to-zinc-900",
    green: "from-green-900/30 to-zinc-900",
    red: "from-red-900/30 to-zinc-900",
    orange: "from-orange-900/30 to-zinc-900",
    blue: "from-blue-900/30 to-zinc-900",
  };

  return (
    <div
      className={clsx(
        "bg-gradient-to-br rounded-xl border border-zinc-800 p-4",
        colorClasses[color]
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-zinc-400">{title}</span>
        {icon && <div className="text-zinc-500">{icon}</div>}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {change !== undefined && (
          <span
            className={clsx(
              "text-sm mb-0.5",
              change > 0 && "text-green-400",
              change < 0 && "text-red-400",
              change === 0 && "text-zinc-400"
            )}
          >
            {change > 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
    </div>
  );
});

// Grid wrapper for stats
export function StatsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{children}</div>
  );
}
