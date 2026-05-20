import type { QuoteProvider } from "@/lib/providers/quotes/types";
import type { Market, Quote, Security } from "@/lib/domain/types";
import { normalizeSymbol, searchKnownSecurities, securityFromSymbol } from "@/lib/domain/symbols";

const BASE_QUOTES: Record<string, Omit<Quote, "quoteTime" | "provider" | "status">> = {
  "AAPL.US": {
    symbol: "AAPL.US",
    price: 226.84,
    change: 2.31,
    changePercent: 1.03,
    currency: "USD",
    marketStatus: "open",
  },
  "MSFT.US": {
    symbol: "MSFT.US",
    price: 512.2,
    change: -1.44,
    changePercent: -0.28,
    currency: "USD",
    marketStatus: "open",
  },
  "NVDA.US": {
    symbol: "NVDA.US",
    price: 181.67,
    change: 3.92,
    changePercent: 2.21,
    currency: "USD",
    marketStatus: "open",
  },
  "TSLA.US": {
    symbol: "TSLA.US",
    price: 421.3,
    change: 8.77,
    changePercent: 2.13,
    currency: "USD",
    marketStatus: "open",
  },
  "GOOGL.US": {
    symbol: "GOOGL.US",
    price: 287.42,
    change: 1.64,
    changePercent: 0.57,
    currency: "USD",
    marketStatus: "open",
  },
  "AMZN.US": {
    symbol: "AMZN.US",
    price: 232.18,
    change: -2.11,
    changePercent: -0.9,
    currency: "USD",
    marketStatus: "open",
  },
  "META.US": {
    symbol: "META.US",
    price: 641.55,
    change: 4.8,
    changePercent: 0.75,
    currency: "USD",
    marketStatus: "open",
  },
  "NFLX.US": {
    symbol: "NFLX.US",
    price: 1186.24,
    change: -6.42,
    changePercent: -0.54,
    currency: "USD",
    marketStatus: "open",
  },
  "700.HK": {
    symbol: "700.HK",
    price: 421.6,
    change: 5.2,
    changePercent: 1.25,
    currency: "HKD",
    marketStatus: "closed",
  },
  "728.HK": {
    symbol: "728.HK",
    price: 4.82,
    change: 0.03,
    changePercent: 0.63,
    currency: "HKD",
    marketStatus: "closed",
  },
  "9988.HK": {
    symbol: "9988.HK",
    price: 86.45,
    change: -0.9,
    changePercent: -1.03,
    currency: "HKD",
    marketStatus: "closed",
  },
  "600519.SH": {
    symbol: "600519.SH",
    price: 1528.12,
    change: 12.43,
    changePercent: 0.82,
    currency: "CNY",
    marketStatus: "closed",
  },
  "000001.SZ": {
    symbol: "000001.SZ",
    price: 11.24,
    change: -0.08,
    changePercent: -0.71,
    currency: "CNY",
    marketStatus: "closed",
  },
  "601728.SH": {
    symbol: "601728.SH",
    price: 7.18,
    change: 0.08,
    changePercent: 1.13,
    currency: "CNY",
    marketStatus: "closed",
  },
  "600036.SH": {
    symbol: "600036.SH",
    price: 39.64,
    change: -0.22,
    changePercent: -0.55,
    currency: "CNY",
    marketStatus: "closed",
  },
};

function syntheticQuote(symbol: string): Omit<Quote, "quoteTime" | "provider" | "status"> {
  const security = securityFromSymbol(symbol);
  const seed = [...security.normalizedSymbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const price = Number(((seed % 240) + 18 + (seed % 9) / 10).toFixed(2));
  const changePercent = Number((((seed % 700) - 350) / 100).toFixed(2));
  const change = Number(((price * changePercent) / 100).toFixed(2));
  return {
    symbol: security.normalizedSymbol,
    price,
    change,
    changePercent,
    currency: security.currency,
    marketStatus: security.market === "US" ? "open" : "closed",
  };
}

export class MockQuoteProvider implements QuoteProvider {
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const quoteTime = new Date().toISOString();
    return symbols.map((symbol) => {
      const normalizedSymbol = normalizeSymbol(symbol);
      const quote = BASE_QUOTES[normalizedSymbol] ?? syntheticQuote(normalizedSymbol);
      return {
        ...quote,
        quoteTime,
        provider: "mock",
        status: "ok",
      };
    });
  }

  async searchSymbols(keyword: string, market?: Market): Promise<Security[]> {
    return searchKnownSecurities(keyword, market);
  }
}
