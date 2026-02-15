import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiquidationsFeed } from "@/components/market/LiquidationsFeed";
import type { Liquidation } from "@/types/hyperliquid";

const baseLiq: Liquidation & { isConfirmed: boolean } = {
  coin: "BTC",
  size: 0.5,
  price: 60000,
  value: 30000,
  side: "long",
  method: "backstop",
  time: Date.now() - 120_000,
  hash: "abc123",
  isConfirmed: true,
};

describe("LiquidationsFeed", () => {
  it("renders empty state when no liquidations", () => {
    render(<LiquidationsFeed liquidations={[]} />);
    expect(screen.getByText("No liquidations yet")).toBeInTheDocument();
  });

  it("renders liquidation items", () => {
    render(<LiquidationsFeed liquidations={[baseLiq]} />);
    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("LONG")).toBeInTheDocument();
    expect(screen.getByText("BACKSTOP")).toBeInTheDocument();
    expect(screen.getByText("$30.0K")).toBeInTheDocument();
  });

  it("shows event count", () => {
    render(<LiquidationsFeed liquidations={[baseLiq, { ...baseLiq, hash: "def" }]} />);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("respects maxItems", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      ...baseLiq,
      hash: `h-${i}`,
    }));
    render(<LiquidationsFeed liquidations={items} maxItems={2} />);
    // Should render 2 items, but show "5 events" count
    expect(screen.getByText("5 events")).toBeInTheDocument();
    const allBtc = screen.getAllByText("BTC");
    expect(allBtc).toHaveLength(2);
  });

  it("renders large trade label for unconfirmed", () => {
    const unconfirmed = { ...baseLiq, isConfirmed: false };
    render(<LiquidationsFeed liquidations={[unconfirmed]} />);
    expect(screen.getByText("LARGE TRADE")).toBeInTheDocument();
  });
});
