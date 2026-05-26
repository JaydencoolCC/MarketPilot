import type { WatchlistRow } from "@/lib/domain/types";

export type StockHoldingMetrics = {
  costValue: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  currency: string;
};

export function hasStockHolding(row: Pick<WatchlistRow, "costPrice" | "shares">) {
  return Number(row.costPrice) > 0 && Number(row.shares) > 0;
}

export function calculateStockHolding(row: WatchlistRow): StockHoldingMetrics | null {
  if (!row.quote || !hasStockHolding(row)) return null;

  const costValue = row.costPrice! * row.shares!;
  const marketValue = row.quote.price * row.shares!;
  const unrealizedPnl = marketValue - costValue;

  return {
    costValue,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent: costValue === 0 ? 0 : (unrealizedPnl / costValue) * 100,
    currency: row.quote.currency,
  };
}
