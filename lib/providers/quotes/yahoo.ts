import { AppError } from "@/lib/domain/errors";
import type { Market, Quote, Security } from "@/lib/domain/types";
import { normalizeSymbol, searchKnownSecurities, securityFromSymbol } from "@/lib/domain/symbols";
import type { QuoteProvider } from "@/lib/providers/quotes/types";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
        marketState?: string;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

export class YahooQuoteProvider implements QuoteProvider {
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((symbol) => this.getQuote(symbol)));
  }

  async searchSymbols(keyword: string, market?: Market): Promise<Security[]> {
    return searchKnownSecurities(keyword, market);
  }

  private async getQuote(symbol: string): Promise<Quote> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const yahooSymbol = toYahooSymbol(normalizedSymbol);
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`);
    url.searchParams.set("range", "1d");
    url.searchParams.set("interval", "1m");

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "trade-workbench/0.1",
      },
    });

    if (!response.ok) {
      throw new AppError("PROVIDER_UNAVAILABLE", `Yahoo Finance 行情请求失败：${response.status}`, 503);
    }

    const payload = (await response.json()) as YahooChartResponse;
    const error = payload.chart?.error;
    if (error) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        error.description ?? "Yahoo Finance 行情不可用。",
        503,
      );
    }

    const meta = payload.chart?.result?.[0]?.meta;
    if (!meta) {
      throw new AppError("PROVIDER_UNAVAILABLE", "Yahoo Finance 没有返回行情数据。", 503);
    }

    const security = securityFromSymbol(normalizedSymbol);
    const price = Number(meta.regularMarketPrice ?? 0);
    const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
    const change = previousClose ? Number((price - previousClose).toFixed(6)) : 0;
    const changePercent = previousClose ? Number(((change / previousClose) * 100).toFixed(6)) : 0;
    const quoteTime = meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();

    return {
      symbol: normalizedSymbol,
      price,
      change,
      changePercent,
      currency: meta.currency ?? security.currency,
      marketStatus: toMarketStatus(meta.marketState),
      provider: "yahoo",
      quoteTime,
      status: "ok",
    };
  }
}

function toYahooSymbol(normalizedSymbol: string) {
  if (normalizedSymbol.endsWith(".US")) {
    return normalizedSymbol.replace(/\.US$/, "");
  }

  if (normalizedSymbol.endsWith(".HK")) {
    const raw = normalizedSymbol.replace(/\.HK$/, "");
    return `${raw.padStart(4, "0")}.HK`;
  }

  if (normalizedSymbol.endsWith(".SH")) {
    return normalizedSymbol.replace(/\.SH$/, ".SS");
  }

  return normalizedSymbol;
}

function toMarketStatus(value?: string): Quote["marketStatus"] {
  if (value === "REGULAR") return "open";
  if (value === "PRE") return "pre_market";
  if (value === "POST" || value === "POSTPOST") return "after_hours";
  return "closed";
}
