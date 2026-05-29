export function formatCurrency(value: number, currency: string) {
  if (currency === "USD") {
    return `$${value.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value);
}

export function formatUnitPrice(value: number, currency: string) {
  if (currency === "USD") {
    return `$${value.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`;
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
    maximumFractionDigits: currency === "JPY" ? 0 : 4,
  }).format(value);
}

export function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function cnMarketName(market: string) {
  if (market === "US") return "美股";
  if (market === "HK") return "港股";
  if (market === "CN") return "A股";
  return market;
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(iso).toLocaleString("zh-CN");
}

export function formatClockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
