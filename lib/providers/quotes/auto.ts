import type { Market, Quote, Security } from "@/lib/domain/types";
import { searchKnownSecurities, securityFromSymbol } from "@/lib/domain/symbols";
import type { QuoteProvider } from "@/lib/providers/quotes/types";
import { SinaQuoteProvider } from "@/lib/providers/quotes/sina";
import { YahooQuoteProvider } from "@/lib/providers/quotes/yahoo";

export class AutoQuoteProvider implements QuoteProvider {
  private readonly yahoo = new YahooQuoteProvider();
  private readonly sina = new SinaQuoteProvider();

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const results = await Promise.all(symbols.map((symbol) => this.getQuote(symbol)));
    return enrichMarketStatuses(results.flat());
  }

  async searchSymbols(keyword: string, market?: Market): Promise<Security[]> {
    const results = await Promise.allSettled([
      this.sina.searchSymbols(keyword, market),
      this.yahoo.searchSymbols(keyword, market),
    ]);
    const merged = new Map<string, Security>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const security of result.value) {
        merged.set(security.normalizedSymbol, security);
      }
    }
    return rankMergedSearchResults([...merged.values()], keyword, market).slice(0, 12);
  }

  private async getQuote(symbol: string) {
    const providers = [this.yahoo, this.sina];
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const [quote] = await provider.getQuotes([symbol]);
        if (quote?.status === "ok") return [quote];
        if (quote?.errorMessage) errors.push(quote.errorMessage);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "行情 provider 暂时不可用。");
      }
    }

    return [errorQuote(symbol, errors)];
  }
}

async function enrichMarketStatuses(quotes: Quote[]) {
  const statusBySymbol = await fetchEastmoneyMarketStatuses(quotes.map((quote) => quote.symbol));
  return quotes.map((quote) => {
    const marketStatus = statusBySymbol.get(quote.symbol);
    return marketStatus ? { ...quote, marketStatus } : quote;
  });
}

async function fetchEastmoneyMarketStatuses(symbols: string[]) {
  const statusBySymbol = new Map<string, Quote["marketStatus"]>();
  const secids = symbols.map(toEastmoneySecid).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (!secids.length) return statusBySymbol;

  try {
    const url = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
    url.searchParams.set("secids", secids.map((entry) => entry.secid).join(","));
    url.searchParams.set("fields", "f12,f13,f292");

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Referer: "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!response.ok) return statusBySymbol;

    const payload = (await response.json()) as {
      data?: {
        diff?: Array<{ f12?: string; f13?: number | string; f292?: number | string }>;
      };
    };
    const symbolByEastmoneyKey = new Map(secids.map((entry) => [entry.key, entry.symbol]));

    for (const item of payload.data?.diff ?? []) {
      const symbol = symbolByEastmoneyKey.get(`${item.f13}.${item.f12}`);
      if (!symbol) continue;
      const status = toEastmoneyMarketStatus(item.f292);
      if (status !== "unknown") statusBySymbol.set(symbol, status);
    }
  } catch {
    return statusBySymbol;
  }

  return statusBySymbol;
}

function toEastmoneySecid(symbol: string) {
  const raw = symbol.split(".")[0] ?? symbol;
  let market: number | null = null;
  let code = raw;

  if (symbol.endsWith(".SH")) market = 1;
  if (symbol.endsWith(".SZ")) market = 0;
  if (symbol.endsWith(".HK")) {
    market = 116;
    code = raw.padStart(5, "0");
  }
  if (symbol.endsWith(".US")) market = 105;

  if (market === null) return null;
  return {
    symbol,
    secid: `${market}.${code}`,
    key: `${market}.${code}`,
  };
}

function toEastmoneyMarketStatus(value: number | string | undefined): Quote["marketStatus"] {
  const status = Number(value);
  if ([2, 3].includes(status)) return "open";
  if (status === 11) return "pre_market";
  if ([0, 1, 4, 5, 6, 7, 8, 9].includes(status)) return "closed";
  return "unknown";
}

function errorQuote(symbol: string, errors: string[]): Quote {
  const security = securityFromSymbol(symbol);
  return {
    symbol: security.normalizedSymbol,
    price: 0,
    change: 0,
    changePercent: 0,
    currency: security.currency,
    marketStatus: "unknown",
    provider: "auto",
    quoteTime: new Date().toISOString(),
    status: "error",
    errorCode: "PROVIDER_UNAVAILABLE",
    errorMessage: `真实行情源暂时不可用：${errors.filter(Boolean).join("；") || "没有返回可用行情。"}`,
  };
}

function rankMergedSearchResults(securities: Security[], keyword: string, market?: Market) {
  const curatedSymbols = new Set(
    searchKnownSecurities(keyword, market).map((security) => security.normalizedSymbol),
  );
  const query = keyword.trim().toUpperCase();

  return [...securities].sort((left, right) => {
    const scoreDiff =
      scoreSearchResult(right, query, curatedSymbols) - scoreSearchResult(left, query, curatedSymbols);
    if (scoreDiff !== 0) return scoreDiff;
    return left.normalizedSymbol.localeCompare(right.normalizedSymbol);
  });
}

function scoreSearchResult(
  security: Security,
  query: string,
  curatedSymbols: Set<string>,
) {
  const symbol = security.symbol.toUpperCase();
  const normalizedSymbol = security.normalizedSymbol.toUpperCase();
  const name = security.name.toUpperCase();
  const aliases = security.aliases?.map((alias) => alias.toUpperCase()) ?? [];
  let score = 0;

  if (curatedSymbols.has(security.normalizedSymbol)) score += 120;
  if (symbol === query || normalizedSymbol === query) score += 110;
  if (aliases.some((alias) => alias === query)) score += 105;
  if (name === query) score += 90;
  if (normalizedSymbol.startsWith(query)) score += 70;
  if (symbol.startsWith(query)) score += 60;
  if (aliases.some((alias) => alias.includes(query) || query.includes(alias))) score += 55;
  if (name.includes(query)) score += 45;
  if (security.market === "US" && /^[A-Z]{1,5}$/.test(symbol)) score += 10;
  if (security.market === "HK" && /^\d{1,5}$/.test(symbol)) score += 8;
  if (security.market === "CN" && /^\d{6}$/.test(symbol)) score += 8;

  if (isDerivativeLike(security)) score -= 80;
  if (isSecondaryListingLike(security)) score -= 25;

  return score;
}

function isDerivativeLike(security: Security) {
  const haystack = `${security.symbol} ${security.name}`.toUpperCase();
  return [
    "ETF",
    "ETN",
    "做多",
    "做空",
    "杠杆",
    "2倍",
    "3倍",
    "1倍",
    "DAILY",
    "TARGET",
    "BEAR",
    "BULL",
    "INVERSE",
  ].some((token) => haystack.includes(token));
}

function isSecondaryListingLike(security: Security) {
  return security.market === "US" && /^\d[A-Z0-9]{3}$/i.test(security.symbol);
}
