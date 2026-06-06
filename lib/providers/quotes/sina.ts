import { AppError } from "@/lib/domain/errors";
import type { Market, Quote, Security } from "@/lib/domain/types";
import { normalizeSymbol, searchKnownSecurities, securityFromSymbol } from "@/lib/domain/symbols";
import { marketDataFetch } from "@/lib/providers/market-data-network";
import type { QuoteProvider } from "@/lib/providers/quotes/types";

type SinaRawQuote = {
  symbol: string;
  code: string;
  raw: string;
};

export class SinaQuoteProvider implements QuoteProvider {
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const normalizedSymbols = symbols.map((symbol) => normalizeSymbol(symbol));
    if (!normalizedSymbols.length) return [];

    const codeBySymbol = new Map(normalizedSymbols.map((symbol) => [symbol, toSinaCode(symbol)]));
    const url = new URL("https://hq.sinajs.cn/list=" + [...codeBySymbol.values()].join(","));
    const response = await marketDataFetch(url, {
      cache: "no-store",
      headers: {
        Referer: "https://finance.sina.com.cn/",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new AppError("PROVIDER_UNAVAILABLE", `Sina 行情请求失败：${response.status}`, 503);
    }

    const text = await response.text();
    const rawQuotes = parseSinaResponse(text, codeBySymbol);
    return normalizedSymbols.map((symbol) => {
      const rawQuote = rawQuotes.get(symbol);
      if (!rawQuote || !rawQuote.raw) {
        return errorQuote(symbol, "SYMBOL_NOT_RETURNED", "Sina 没有返回该标的行情。");
      }

      if (symbol.endsWith(".US")) return parseUsQuote(rawQuote);
      if (symbol.endsWith(".HK")) return parseHkQuote(rawQuote);
      return parseCnQuote(rawQuote);
    });
  }

  async searchSymbols(keyword: string, market?: Market): Promise<Security[]> {
    const localResults = searchKnownSecurities(keyword, market);
    const query = keyword.trim();
    if (!query) return localResults;

    try {
      const remoteResults = await searchSinaSuggestions(query, market);
      return rankSecurities(mergeSecurities(remoteResults, localResults), query).slice(0, 12);
    } catch {
      return localResults;
    }
  }
}

async function searchSinaSuggestions(keyword: string, market?: Market): Promise<Security[]> {
  const url = new URL("https://suggest3.sinajs.cn/suggest/type=");
  url.searchParams.set("key", keyword);
  url.searchParams.set("name", "suggestvalue");

  const response = await marketDataFetch(url, {
    cache: "no-store",
    headers: {
      Referer: "https://finance.sina.com.cn/",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `Sina 搜索请求失败：${response.status}`, 503);
  }

  const text = new TextDecoder("gb18030").decode(await response.arrayBuffer());
  return parseSinaSuggestions(text, market);
}

function parseSinaSuggestions(text: string, market?: Market): Security[] {
  const raw = text.match(/suggestvalue="([^"]*)"/)?.[1] ?? "";
  if (!raw) return [];

  return raw
    .split(";")
    .flatMap((item) => item.split("\\n"))
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseSinaSuggestion)
    .filter((security): security is Security => Boolean(security))
    .filter((security) => (market ? security.market === market : true));
}

function parseSinaSuggestion(item: string): Security | null {
  const fields = item.split(",");
  const name = resolveSinaSuggestionName(fields);
  const type = fields[1]?.trim();
  const code = fields[2]?.trim();
  const marketCode = fields[3]?.trim().toLowerCase();
  if (!name || !code || !marketCode) return null;

  if (type === "11" || marketCode.startsWith("sh") || marketCode.startsWith("sz")) {
    if (!/^[036]\d{5}$/.test(code)) return null;
    const marketSuffix = marketCode.startsWith("sh") ? "SH" : "SZ";
    return {
      symbol: code,
      normalizedSymbol: `${code}.${marketSuffix}`,
      market: "CN",
      name,
      currency: "CNY",
    };
  }

  if (type === "31" || marketCode.startsWith("hk")) {
    const rawCode = code.replace(/^0+(?=\d)/, "");
    return {
      symbol: rawCode,
      normalizedSymbol: `${rawCode}.HK`,
      market: "HK",
      name,
      currency: "HKD",
    };
  }

  if (type === "41" || type === "103" || marketCode.startsWith("gb_")) {
    const symbol = code.toUpperCase();
    return {
      symbol,
      normalizedSymbol: `${symbol}.US`,
      market: "US",
      name,
      currency: "USD",
    };
  }

  return null;
}

function resolveSinaSuggestionName(fields: string[]) {
  const code = fields[2]?.trim();
  const marketCode = fields[3]?.trim();
  const codeLikeNames = new Set(
    [code, marketCode, code ? `${marketCode?.slice(0, 2) ?? ""}${code}` : undefined]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );

  return (
    [fields[4], fields[6], fields[0]]
      .filter((field): field is string => Boolean(field))
      .map((field) => field.trim())
      .find((field) => field && !codeLikeNames.has(field.toLowerCase()) && !/^[a-z]{0,3}\d{5,6}$/i.test(field)) ??
    fields[0]?.trim()
  );
}

function mergeSecurities(...groups: Security[][]) {
  const results = new Map<string, Security>();
  for (const group of groups) {
    for (const security of group) {
      results.set(security.normalizedSymbol, security);
    }
  }
  return [...results.values()];
}

function rankSecurities(securities: Security[], keyword: string) {
  const query = keyword.trim().toUpperCase();
  return [...securities].sort((left, right) => scoreSecurity(right, query) - scoreSecurity(left, query));
}

function scoreSecurity(security: Security, query: string) {
  const symbol = security.symbol.toUpperCase();
  const normalizedSymbol = security.normalizedSymbol.toUpperCase();
  const name = security.name.toUpperCase();
  const aliases = security.aliases?.map((alias) => alias.toUpperCase()) ?? [];
  if (symbol === query || normalizedSymbol === query) return 100;
  if (aliases.some((alias) => alias === query)) return 95;
  if (name === query) return 90;
  if (normalizedSymbol.startsWith(query)) return 80;
  if (symbol.startsWith(query)) return 70;
  if (aliases.some((alias) => alias.includes(query) || query.includes(alias))) return 65;
  if (name.includes(query)) return 60;
  return 0;
}

function toSinaCode(normalizedSymbol: string) {
  const raw = normalizedSymbol.split(".")[0] ?? normalizedSymbol;
  if (normalizedSymbol.endsWith(".SH")) return `sh${raw}`;
  if (normalizedSymbol.endsWith(".SZ")) return `sz${raw}`;
  if (normalizedSymbol.endsWith(".HK")) return `hk${raw.padStart(5, "0")}`;
  return `gb_${raw.toLowerCase()}`;
}

function parseSinaResponse(text: string, codeBySymbol: Map<string, string>) {
  const quotes = new Map<string, SinaRawQuote>();
  for (const [symbol, code] of codeBySymbol) {
    const pattern = new RegExp(`hq_str_${code}="([^"]*)"`);
    const raw = pattern.exec(text)?.[1] ?? "";
    quotes.set(symbol, { symbol, code, raw });
  }
  return quotes;
}

function parseCnQuote(quote: SinaRawQuote): Quote {
  const fields = quote.raw.split(",");
  const security = securityFromSymbol(quote.symbol);
  const price = toNumber(fields[3]);
  const previousClose = toNumber(fields[2]);
  const change = Number((price - previousClose).toFixed(6));
  const changePercent = previousClose ? Number(((change / previousClose) * 100).toFixed(6)) : 0;
  const date = fields[30];
  const time = fields[31];

  return {
    symbol: quote.symbol,
    price,
    change,
    changePercent,
    currency: security.currency,
    marketStatus: "unknown",
    provider: "sina",
    quoteTime: parseQuoteTime(date, time),
    status: "ok",
  };
}

function parseUsQuote(quote: SinaRawQuote): Quote {
  const fields = quote.raw.split(",");
  const security = securityFromSymbol(quote.symbol);
  const price = toNumber(fields[1]);
  const change = toNumber(fields[2]);
  const changePercent = toNumber(fields[3]);

  return {
    symbol: quote.symbol,
    price,
    change,
    changePercent,
    currency: security.currency,
    marketStatus: "unknown",
    provider: "sina",
    quoteTime: new Date().toISOString(),
    status: "ok",
  };
}

function parseHkQuote(quote: SinaRawQuote): Quote {
  const fields = quote.raw.split(",");
  const security = securityFromSymbol(quote.symbol);
  const numericFields = fields.map(toNumber).filter((value) => value > 0);
  const price = toNumber(fields[6]) || toNumber(fields[3]) || numericFields[0] || 0;
  const previousClose = toNumber(fields[3]) || numericFields[1] || 0;
  const change = previousClose ? Number((price - previousClose).toFixed(6)) : toNumber(fields[9]);
  const changePercent = previousClose ? Number(((change / previousClose) * 100).toFixed(6)) : toNumber(fields[10]);

  return {
    symbol: quote.symbol,
    price,
    change,
    changePercent,
    currency: security.currency,
    marketStatus: "unknown",
    provider: "sina",
    quoteTime: new Date().toISOString(),
    status: "ok",
  };
}

function errorQuote(symbol: string, errorCode: string, errorMessage: string): Quote {
  const security = securityFromSymbol(symbol);
  return {
    symbol: security.normalizedSymbol,
    price: 0,
    change: 0,
    changePercent: 0,
    currency: security.currency,
    marketStatus: "closed",
    provider: "sina",
    quoteTime: new Date().toISOString(),
    status: "error",
    errorCode,
    errorMessage,
  };
}

function toNumber(value: string | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseQuoteTime(date: string | undefined, time: string | undefined) {
  if (!date || !time) return new Date().toISOString();
  return new Date(`${date}T${time}+08:00`).toISOString();
}
