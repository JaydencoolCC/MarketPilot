import { AppError } from "@/lib/domain/errors";
import type { Market, Security } from "@/lib/domain/types";

const KNOWN_SECURITIES: Record<string, Security> = {
  "AAPL.US": {
    symbol: "AAPL",
    normalizedSymbol: "AAPL.US",
    market: "US",
    name: "Apple",
    currency: "USD",
    aliases: ["苹果", "蘋果", "apple inc", "pingguo"],
  },
  "MSFT.US": {
    symbol: "MSFT",
    normalizedSymbol: "MSFT.US",
    market: "US",
    name: "Microsoft",
    currency: "USD",
    aliases: ["微软", "微軟", "microsoft corporation", "weiruan"],
  },
  "NVDA.US": {
    symbol: "NVDA",
    normalizedSymbol: "NVDA.US",
    market: "US",
    name: "NVIDIA",
    currency: "USD",
    aliases: ["英伟达", "英偉達", "nvidia corporation", "yingweida"],
  },
  "TSLA.US": {
    symbol: "TSLA",
    normalizedSymbol: "TSLA.US",
    market: "US",
    name: "Tesla",
    currency: "USD",
    aliases: ["特斯拉", "tesla inc", "tesila"],
  },
  "GOOGL.US": {
    symbol: "GOOGL",
    normalizedSymbol: "GOOGL.US",
    market: "US",
    name: "Alphabet",
    currency: "USD",
    aliases: ["谷歌", "google", "alphabet inc", "guge"],
  },
  "AMZN.US": {
    symbol: "AMZN",
    normalizedSymbol: "AMZN.US",
    market: "US",
    name: "Amazon",
    currency: "USD",
    aliases: ["亚马逊", "亞馬遜", "amazon.com", "yamaxun"],
  },
  "META.US": {
    symbol: "META",
    normalizedSymbol: "META.US",
    market: "US",
    name: "Meta Platforms",
    currency: "USD",
    aliases: ["meta", "facebook", "脸书", "臉書"],
  },
  "NFLX.US": {
    symbol: "NFLX",
    normalizedSymbol: "NFLX.US",
    market: "US",
    name: "Netflix",
    currency: "USD",
    aliases: ["奈飞", "奈飛", "netflix inc", "naifei"],
  },
  "700.HK": {
    symbol: "700",
    normalizedSymbol: "700.HK",
    market: "HK",
    name: "腾讯控股",
    currency: "HKD",
    aliases: ["腾讯", "騰訊", "tencent", "tengxun"],
  },
  "1810.HK": {
    symbol: "1810",
    normalizedSymbol: "1810.HK",
    market: "HK",
    name: "小米集团-W",
    currency: "HKD",
    aliases: ["小米", "小米集團", "xiaomi", "xiaomi corporation"],
  },
  "728.HK": {
    symbol: "728",
    normalizedSymbol: "728.HK",
    market: "HK",
    name: "中国电信",
    currency: "HKD",
    aliases: ["中电信", "中國電信", "china telecom", "zhongguodianxin"],
  },
  "9988.HK": {
    symbol: "9988",
    normalizedSymbol: "9988.HK",
    market: "HK",
    name: "阿里巴巴-W",
    currency: "HKD",
    aliases: ["阿里巴巴", "阿里", "alibaba", "baba", "alibaba group"],
  },
  "600519.SH": {
    symbol: "600519",
    normalizedSymbol: "600519.SH",
    market: "CN",
    name: "贵州茅台",
    currency: "CNY",
    aliases: ["茅台", "貴州茅台", "kweichow moutai", "maotai"],
  },
  "000001.SZ": {
    symbol: "000001",
    normalizedSymbol: "000001.SZ",
    market: "CN",
    name: "平安银行",
    currency: "CNY",
    aliases: ["平安", "平安銀行", "ping an bank", "pingan"],
  },
  "000001.SH": {
    symbol: "000001",
    normalizedSymbol: "000001.SH",
    market: "CN",
    name: "上证指数",
    currency: "CNY",
    aliases: ["上证", "上證指數", "shanghai composite", "sse composite"],
  },
  "000725.SZ": {
    symbol: "000725",
    normalizedSymbol: "000725.SZ",
    market: "CN",
    name: "京东方A",
    currency: "CNY",
    aliases: ["京东方", "京東方", "boe", "boe technology"],
  },
  "002352.SZ": {
    symbol: "002352",
    normalizedSymbol: "002352.SZ",
    market: "CN",
    name: "顺丰控股",
    currency: "CNY",
    aliases: ["顺丰", "順豐", "sf holding", "shunfeng"],
  },
  "601728.SH": {
    symbol: "601728",
    normalizedSymbol: "601728.SH",
    market: "CN",
    name: "中国电信",
    currency: "CNY",
    aliases: ["中电信", "中國電信", "china telecom", "zhongguodianxin"],
  },
  "600036.SH": {
    symbol: "600036",
    normalizedSymbol: "600036.SH",
    market: "CN",
    name: "招商银行",
    currency: "CNY",
    aliases: ["招行", "招商銀行", "cmb", "china merchants bank"],
  },
};

export function normalizeSymbol(symbol: string, market?: Market): string {
  const selectedFragment = symbol.includes("·") ? (symbol.split("·").pop() ?? symbol) : symbol;
  const cleaned = selectedFragment.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) {
    throw new AppError("VALIDATION_ERROR", "请输入股票代码", 400);
  }

  if (!/^[A-Z0-9.]+$/.test(cleaned)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "请输入有效股票代码，或先从搜索结果里选择证券。",
      400,
    );
  }

  if (/\.(US|HK|SH|SZ)$/.test(cleaned)) {
    return cleaned;
  }

  if (market === "US") {
    return `${cleaned}.US`;
  }

  if (market === "HK") {
    return `${cleaned.replace(/^0+(?=\d)/, "")}.HK`;
  }

  if (market === "CN") {
    return `${cleaned}.${cleaned.startsWith("6") ? "SH" : "SZ"}`;
  }

  if (/^\d{6}$/.test(cleaned)) {
    return `${cleaned}.${cleaned.startsWith("6") ? "SH" : "SZ"}`;
  }

  if (/^\d{1,5}$/.test(cleaned)) {
    return `${cleaned.replace(/^0+(?=\d)/, "")}.HK`;
  }

  return `${cleaned}.US`;
}

export function marketFromSymbol(normalizedSymbol: string): Market {
  if (normalizedSymbol.endsWith(".US")) return "US";
  if (normalizedSymbol.endsWith(".HK")) return "HK";
  if (normalizedSymbol.endsWith(".SH") || normalizedSymbol.endsWith(".SZ")) return "CN";
  throw new Error(`无法识别市场：${normalizedSymbol}`);
}

export function securityFromSymbol(symbol: string, market?: Market): Security {
  const normalizedSymbol = normalizeSymbol(symbol, market);
  const known = KNOWN_SECURITIES[normalizedSymbol];
  if (known) {
    return known;
  }

  const resolvedMarket = marketFromSymbol(normalizedSymbol);
  const rawSymbol = normalizedSymbol.split(".")[0] ?? normalizedSymbol;
  return {
    symbol: rawSymbol,
    normalizedSymbol,
    market: resolvedMarket,
    name: normalizedSymbol,
    currency: resolvedMarket === "US" ? "USD" : resolvedMarket === "HK" ? "HKD" : "CNY",
  };
}

export function searchKnownSecurities(keyword: string, market?: Market): Security[] {
  const query = keyword.trim().toUpperCase();
  return Object.values(KNOWN_SECURITIES).filter((security) => {
    const matchesMarket = market ? security.market === market : true;
    const haystack = [
      security.normalizedSymbol,
      security.symbol,
      security.name,
      ...(security.aliases ?? []),
    ].map((value) => value.toUpperCase());
    const matchesQuery =
      !query ||
      haystack.some((value) => value.includes(query)) ||
      haystack.some((value) => query.includes(value));
    return matchesMarket && matchesQuery;
  });
}
