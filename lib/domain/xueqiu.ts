import { normalizeSymbol, xueqiuIndexSymbolFor } from "@/lib/domain/symbols";

export function xueqiuStockUrl(normalizedSymbol: string) {
  const xueqiuIndexSymbol = xueqiuIndexSymbolFor(normalizedSymbol);
  if (xueqiuIndexSymbol) return `https://xueqiu.com/S/${xueqiuIndexSymbol}`;

  const [symbol, market] = normalizedSymbol.split(".");
  if (market === "US") return `https://xueqiu.com/S/${symbol}`;
  if (market === "HK") return `https://xueqiu.com/S/${symbol.padStart(5, "0")}?from=status_stock_match`;
  if (market === "SH") return `https://xueqiu.com/S/SH${symbol}`;
  if (market === "SZ") return `https://xueqiu.com/S/SZ${symbol}`;
  return `https://xueqiu.com/S/${encodeURIComponent(symbol ?? normalizedSymbol)}`;
}

export function xueqiuFundUrl(normalizedSymbol: string) {
  if (normalizedSymbol.endsWith(".FUND")) {
    return `https://xueqiu.com/S/F${normalizedSymbol.replace(/\.FUND$/, "")}`;
  }

  return xueqiuStockUrl(normalizedSymbol);
}

export function stockDetailUrl(normalizedSymbol: string) {
  const resolvedSymbol = normalizeSymbol(normalizedSymbol);
  if (xueqiuIndexSymbolFor(resolvedSymbol)) {
    return xueqiuStockUrl(resolvedSymbol);
  }

  if (resolvedSymbol.endsWith(".T") || resolvedSymbol.startsWith("^")) {
    return `https://finance.yahoo.com/quote/${encodeURIComponent(resolvedSymbol)}`;
  }

  return xueqiuStockUrl(resolvedSymbol);
}

export function fundDetailUrl(normalizedSymbol: string) {
  if (normalizedSymbol.endsWith(".FUND")) {
    return xueqiuFundUrl(normalizedSymbol);
  }

  const resolvedSymbol = normalizeSymbol(normalizedSymbol);
  if (resolvedSymbol.endsWith(".T") || resolvedSymbol.startsWith("^")) {
    return stockDetailUrl(resolvedSymbol);
  }

  return xueqiuFundUrl(resolvedSymbol);
}
