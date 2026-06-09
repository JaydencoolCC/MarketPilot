import type { DigestPreview, FundRow, WatchlistRow } from "@/lib/domain/types";
import { calculateStockHolding, hasStockHolding } from "@/lib/domain/holdings";
import { formatCurrency, formatPercent, formatUnitPrice } from "@/lib/utils/format";

export function buildHoldingsDigestSection(input: {
  stocks: WatchlistRow[];
  funds: FundRow[];
}): DigestPreview["sections"][number] | null {
  const stockLines = input.stocks
    .filter(hasStockHolding)
    .map((row) => {
      const metrics = calculateStockHolding(row);
      if (!metrics) return `${row.name}（${row.normalizedSymbol}）：等待行情更新。`;
      return [
        `${row.name}（${row.normalizedSymbol}）`,
        `持仓 ${row.shares} 股`,
        `成本 ${formatUnitPrice(row.costPrice ?? 0, row.currency)}`,
        `当前市值 ${formatCurrency(metrics.marketValue, metrics.currency)}`,
        `今日收益 ${signedCurrency(metrics.todayPnl, metrics.currency)}`,
        `浮动盈亏 ${signedCurrency(metrics.unrealizedPnl, metrics.currency)}${formatPnlPercent(metrics.unrealizedPnlPercent)}`,
      ].join("，") + "。";
    });

  const fundLines = input.funds
    .filter(hasFundHolding)
    .map((row) => {
      const metrics = calculateFundHolding(row);
      if (!metrics) return `${row.name}（${row.normalizedSymbol}）：等待净值更新。`;
      return [
        `${row.name}（${row.normalizedSymbol}）`,
        `份额 ${formatShares(row.shares)}`,
        `成本净值 ${formatUnitPrice(row.costPrice ?? 0, row.currency)}`,
        `当前市值 ${formatCurrency(metrics.marketValue, metrics.currency)}`,
        `今日收益 ${signedCurrency(metrics.todayPnl, metrics.currency)}`,
        `浮动盈亏 ${signedCurrency(metrics.unrealizedPnl, metrics.currency)}${formatPnlPercent(metrics.unrealizedPnlPercent)}`,
      ].join("，") + "。";
    });

  const lines = [...stockLines, ...fundLines];
  if (!lines.length) return null;

  return {
    heading: "当前持仓",
    body: lines.map((line) => `- ${line}`).join("\n"),
  };
}

function hasFundHolding(row: Pick<FundRow, "costPrice" | "shares">) {
  return row.costPrice !== undefined && Number(row.shares) > 0;
}

function calculateFundHolding(row: FundRow) {
  if (!row.snapshot || !hasFundHolding(row)) return null;

  const currentPrice = row.snapshot.estimateValue ?? row.snapshot.netValue;
  const costValue = row.costPrice! * row.shares!;
  const marketValue = currentPrice * row.shares!;
  const previousPrice = row.snapshot.changePercent === -100
    ? currentPrice
    : currentPrice / (1 + row.snapshot.changePercent / 100);
  const todayPnl = (currentPrice - previousPrice) * row.shares!;
  const unrealizedPnl = marketValue - costValue;
  const costBasis = Math.abs(costValue);

  return {
    marketValue,
    todayPnl,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis === 0 ? null : (unrealizedPnl / costBasis) * 100,
    currency: row.snapshot.currency,
  };
}

function signedCurrency(value: number, currency: string) {
  const formatted = formatCurrency(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatPnlPercent(value: number | null) {
  return value === null ? "" : `（${formatPercent(value)}）`;
}

function formatShares(value: number | undefined) {
  return value === undefined ? "-" : Number(value.toFixed(4)).toLocaleString("zh-CN");
}
