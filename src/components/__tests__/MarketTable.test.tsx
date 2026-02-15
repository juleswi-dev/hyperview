import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketTable } from "@/components/market/MarketTable";
import type { Asset } from "@/types/hyperliquid";

const mockAsset: Asset & { midPrice: string; change: number } = {
  meta: { name: "BTC", szDecimals: 3, maxLeverage: 50 },
  ctx: {
    funding: "0.0001",
    openInterest: "1000",
    prevDayPx: "60000",
    dayNtlVlm: "500000000",
    premium: "0",
    oraclePx: "61000",
    markPx: "61500",
  },
  index: 0,
  midPrice: "62000",
  change: 3.33,
};

describe("MarketTable", () => {
  it("renders asset name and price", () => {
    render(<MarketTable assets={[mockAsset]} />);
    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("$62,000.00")).toBeInTheDocument();
  });

  it("renders change percentage", () => {
    render(<MarketTable assets={[mockAsset]} />);
    expect(screen.getByText("+3.33%")).toBeInTheDocument();
  });

  it("shows title when provided", () => {
    render(<MarketTable assets={[mockAsset]} title="Top Markets" />);
    expect(screen.getByText("Top Markets")).toBeInTheDocument();
  });

  it("shows volume column when showVolume is true", () => {
    render(<MarketTable assets={[mockAsset]} showVolume={true} />);
    expect(screen.getByText("24h Volume")).toBeInTheDocument();
    expect(screen.getByText("$500.00M")).toBeInTheDocument();
  });

  it("hides volume column when showVolume is false", () => {
    render(<MarketTable assets={[mockAsset]} showVolume={false} />);
    expect(screen.queryByText("24h Volume")).not.toBeInTheDocument();
  });

  it("shows funding rate", () => {
    render(<MarketTable assets={[mockAsset]} showFunding={true} />);
    expect(screen.getByText("+0.0100%")).toBeInTheDocument();
  });
});
