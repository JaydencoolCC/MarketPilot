import type { WatchlistRow } from "@/lib/domain/types";

export type StockHoldingMetrics = {
  costValue: number;
  marketValue: number;
  todayPnl: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number | null;
  currency: string;
};

export function hasStockHolding(row: Pick<WatchlistRow, "costPrice" | "shares">) {
  return row.costPrice !== undefined && Number(row.shares) > 0;
}

export function calculateStockHolding(row: WatchlistRow): StockHoldingMetrics | null {
  if (!row.quote || !hasStockHolding(row)) return null;
  if (row.quote.status === "error" && row.quote.price <= 0) return null;

  const costValue = row.costPrice! * row.shares!;
  const marketValue = row.quote.price * row.shares!;
  const todayPnl = row.quote.change * row.shares!;
  const unrealizedPnl = marketValue - costValue;
  const costBasis = Math.abs(costValue);

  return {
    costValue,
    marketValue,
    todayPnl,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis === 0 ? null : (unrealizedPnl / costBasis) * 100,
    currency: row.quote.currency,
  };
}
