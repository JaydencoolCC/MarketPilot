import type { Market, Quote, Security } from "@/lib/domain/types";
import { securityFromSymbol } from "@/lib/domain/symbols";
import type { QuoteProvider } from "@/lib/providers/quotes/types";
import { SinaQuoteProvider } from "@/lib/providers/quotes/sina";
import { YahooQuoteProvider } from "@/lib/providers/quotes/yahoo";

export class AutoQuoteProvider implements QuoteProvider {
  private readonly yahoo = new YahooQuoteProvider();
  private readonly sina = new SinaQuoteProvider();

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const results = await Promise.all(symbols.map((symbol) => this.getQuote(symbol)));
    return results.flat();
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
    return [...merged.values()];
  }

  private async getQuote(symbol: string) {
    const providers = [this.yahoo, this.sina];
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const [quote] = await provider.getQuotes([symbol]);
        if (quote?.status === "ok") return [{ ...quote, provider: `auto:${quote.provider}` }];
        if (quote?.errorMessage) errors.push(quote.errorMessage);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "行情 provider 暂时不可用。");
      }
    }

    return [errorQuote(symbol, errors)];
  }
}

function errorQuote(symbol: string, errors: string[]): Quote {
  const security = securityFromSymbol(symbol);
  return {
    symbol: security.normalizedSymbol,
    price: 0,
    change: 0,
    changePercent: 0,
    currency: security.currency,
    marketStatus: "closed",
    provider: "auto",
    quoteTime: new Date().toISOString(),
    status: "error",
    errorCode: "PROVIDER_UNAVAILABLE",
    errorMessage: `真实行情源暂时不可用：${errors.filter(Boolean).join("；") || "没有返回可用行情。"}`,
  };
}
