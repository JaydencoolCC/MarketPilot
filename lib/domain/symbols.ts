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
  "000876.SZ": {
    symbol: "000876",
    normalizedSymbol: "000876.SZ",
    market: "CN",
    name: "新希望",
    currency: "CNY",
    aliases: ["新希望六和", "new hope", "new hope liuhe"],
  },
  "002352.SZ": {
    symbol: "002352",
    normalizedSymbol: "002352.SZ",
    market: "CN",
    name: "顺丰控股",
    currency: "CNY",
    aliases: ["顺丰", "順豐", "sf holding", "shunfeng"],
  },
  "002475.SZ": {
    symbol: "002475",
    normalizedSymbol: "002475.SZ",
    market: "CN",
    name: "立讯精密",
    currency: "CNY",
    aliases: ["立讯", "立訊精密", "luxshare", "luxshare precision"],
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
  "7203.T": {
    symbol: "7203",
    normalizedSymbol: "7203.T",
    market: "JP",
    name: "Toyota Motor",
    currency: "JPY",
    aliases: ["丰田", "豐田", "toyota", "toyota motor", "fengtian"],
  },
  "6758.T": {
    symbol: "6758",
    normalizedSymbol: "6758.T",
    market: "JP",
    name: "Sony Group",
    currency: "JPY",
    aliases: ["索尼", "sony", "sony group", "suoni"],
  },
  "7974.T": {
    symbol: "7974",
    normalizedSymbol: "7974.T",
    market: "JP",
    name: "Nintendo",
    currency: "JPY",
    aliases: ["任天堂", "nintendo", "rentian tang"],
  },
  "^N225": {
    symbol: "^N225",
    normalizedSymbol: "^N225",
    market: "JP",
    name: "日经225",
    currency: "JPY",
    aliases: ["日经", "日經", "日经平均", "日經平均", "nikkei", "nikkei 225", "nikkei stock average"],
  },
  "^TOPX": {
    symbol: "^TOPX",
    normalizedSymbol: "^TOPX",
    market: "JP",
    name: "TOPIX",
    currency: "JPY",
    aliases: ["东证指数", "東證指數", "东京证交所指数", "東京證交所指數", "topix"],
  },
  "^NDX": {
    symbol: "^NDX",
    normalizedSymbol: "^NDX",
    market: "US",
    name: "Nasdaq 100",
    currency: "USD",
    aliases: ["纳斯达克100", "納斯達克100", "纳指100", "nasdaq 100", "ndx"],
  },
  "^GSPC": {
    symbol: "^GSPC",
    normalizedSymbol: "^GSPC",
    market: "US",
    name: "S&P 500",
    currency: "USD",
    aliases: ["标普500", "標普500", "sp500", "s&p 500", "inx"],
  },
  "^DJI": {
    symbol: "^DJI",
    normalizedSymbol: "^DJI",
    market: "US",
    name: "Dow Jones Industrial Average",
    currency: "USD",
    aliases: ["道琼斯", "道瓊斯", "dow jones", "dji"],
  },
  "^IXIC": {
    symbol: "^IXIC",
    normalizedSymbol: "^IXIC",
    market: "US",
    name: "Nasdaq Composite",
    currency: "USD",
    aliases: ["纳斯达克综合", "納斯達克綜合", "纳指综合", "nasdaq composite", "ixic"],
  },
};

const INDEX_SYMBOLS: Record<string, { normalizedSymbol: string; xueqiuSymbol?: string }> = {
  "^NDX": { normalizedSymbol: "^NDX", xueqiuSymbol: ".NDX" },
  ".NDX": { normalizedSymbol: "^NDX", xueqiuSymbol: ".NDX" },
  ".NDX.US": { normalizedSymbol: "^NDX", xueqiuSymbol: ".NDX" },
  "NDX": { normalizedSymbol: "^NDX", xueqiuSymbol: ".NDX" },
  "NDX.US": { normalizedSymbol: "^NDX", xueqiuSymbol: ".NDX" },
  "NASDAQ100": { normalizedSymbol: "^NDX", xueqiuSymbol: ".NDX" },
  "NASDAQ-100": { normalizedSymbol: "^NDX", xueqiuSymbol: ".NDX" },
  "^GSPC": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  ".INX": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  ".INX.US": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  "INX": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  "INX.US": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  "GSPC": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  "^SPX": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  "SPX": { normalizedSymbol: "^GSPC", xueqiuSymbol: ".INX" },
  "^DJI": { normalizedSymbol: "^DJI", xueqiuSymbol: ".DJI" },
  ".DJI": { normalizedSymbol: "^DJI", xueqiuSymbol: ".DJI" },
  ".DJI.US": { normalizedSymbol: "^DJI", xueqiuSymbol: ".DJI" },
  "DJI": { normalizedSymbol: "^DJI", xueqiuSymbol: ".DJI" },
  "DJI.US": { normalizedSymbol: "^DJI", xueqiuSymbol: ".DJI" },
  "^IXIC": { normalizedSymbol: "^IXIC", xueqiuSymbol: ".IXIC" },
  ".IXIC": { normalizedSymbol: "^IXIC", xueqiuSymbol: ".IXIC" },
  ".IXIC.US": { normalizedSymbol: "^IXIC", xueqiuSymbol: ".IXIC" },
  "IXIC": { normalizedSymbol: "^IXIC", xueqiuSymbol: ".IXIC" },
  "IXIC.US": { normalizedSymbol: "^IXIC", xueqiuSymbol: ".IXIC" },
  "^N225": { normalizedSymbol: "^N225" },
  "^TOPX": { normalizedSymbol: "^TOPX" },
};

export function normalizeSymbol(symbol: string, market?: Market): string {
  const selectedFragment = symbol.includes("·") ? (symbol.split("·").pop() ?? symbol) : symbol;
  const cleaned = selectedFragment.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) {
    throw new AppError("VALIDATION_ERROR", "请输入股票代码", 400);
  }

  const indexSymbol = INDEX_SYMBOLS[cleaned]?.normalizedSymbol ?? cleaned;
  if (indexSymbol.startsWith("^")) {
    return indexSymbol;
  }

  const prefixedChinaSymbol = /^(SH|SZ)(\d{6})$/.exec(indexSymbol);
  if (prefixedChinaSymbol) {
    return `${prefixedChinaSymbol[2]}.${prefixedChinaSymbol[1]}`;
  }

  if (!/^[A-Z0-9.]+$/.test(indexSymbol)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "请输入有效股票代码，或先从搜索结果里选择证券。",
      400,
    );
  }

  if (/^\.[A-Z0-9]+(?:\.US)?$/.test(indexSymbol)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "暂不支持该指数代码，请先从搜索结果里选择证券。",
      400,
    );
  }

  if (/\.(US|HK|SH|SZ|T)$/.test(indexSymbol)) {
    return indexSymbol;
  }

  if (market === "US") {
    return `${indexSymbol}.US`;
  }

  if (market === "HK") {
    return `${indexSymbol.replace(/^0+(?=\d)/, "")}.HK`;
  }

  if (market === "CN") {
    return `${indexSymbol}.${indexSymbol.startsWith("6") ? "SH" : "SZ"}`;
  }

  if (market === "JP") {
    return `${indexSymbol}.T`;
  }

  if (/^\d{6}$/.test(indexSymbol)) {
    return `${indexSymbol}.${indexSymbol.startsWith("6") ? "SH" : "SZ"}`;
  }

  if (/^\d{1,5}$/.test(indexSymbol)) {
    return `${indexSymbol.replace(/^0+(?=\d)/, "")}.HK`;
  }

  return `${indexSymbol}.US`;
}

export function marketFromSymbol(normalizedSymbol: string): Market {
  if (normalizedSymbol.endsWith(".US")) return "US";
  if (normalizedSymbol.endsWith(".HK")) return "HK";
  if (normalizedSymbol.endsWith(".SH") || normalizedSymbol.endsWith(".SZ")) return "CN";
  if (normalizedSymbol.endsWith(".T")) return "JP";
  if (normalizedSymbol === "^N225" || normalizedSymbol === "^TOPX") return "JP";
  if (KNOWN_SECURITIES[normalizedSymbol]?.market) return KNOWN_SECURITIES[normalizedSymbol].market;
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
    currency: resolvedMarket === "US" ? "USD" : resolvedMarket === "HK" ? "HKD" : resolvedMarket === "JP" ? "JPY" : "CNY",
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

export function xueqiuIndexSymbolFor(normalizedSymbol: string) {
  return INDEX_SYMBOLS[normalizeSymbol(normalizedSymbol)]?.xueqiuSymbol;
}
