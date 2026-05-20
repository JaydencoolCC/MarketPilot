import { AppError } from "@/lib/domain/errors";
import type { Market, Quote, Security } from "@/lib/domain/types";
import { normalizeSymbol, searchKnownSecurities, securityFromSymbol } from "@/lib/domain/symbols";
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
    const response = await fetch(url, {
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
    return searchKnownSecurities(keyword, market);
  }
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
    marketStatus: isTradingNow(time) ? "open" : "closed",
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
    marketStatus: "closed",
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
    marketStatus: "closed",
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

function isTradingNow(time: string | undefined) {
  if (!time) return false;
  return time >= "09:30:00" && time <= "15:00:00";
}
