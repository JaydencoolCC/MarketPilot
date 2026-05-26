export function xueqiuStockUrl(normalizedSymbol: string) {
  const [symbol, market] = normalizedSymbol.split(".");
  if (market === "US") return `https://xueqiu.com/S/${symbol}`;
  if (market === "HK") return `https://xueqiu.com/S/${symbol.padStart(5, "0")}?from=status_stock_match`;
  if (market === "SH") return `https://xueqiu.com/S/SH${symbol}`;
  if (market === "SZ") return `https://xueqiu.com/S/SZ${symbol}`;
  return `https://xueqiu.com/S/${symbol}`;
}

export function xueqiuFundUrl(normalizedSymbol: string) {
  if (normalizedSymbol.endsWith(".FUND")) {
    return `https://xueqiu.com/S/F${normalizedSymbol.replace(/\.FUND$/, "")}`;
  }

  return xueqiuStockUrl(normalizedSymbol);
}
