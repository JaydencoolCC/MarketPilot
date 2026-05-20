import type { Market, Quote, Security } from "@/lib/domain/types";

export interface QuoteProvider {
  getQuotes(symbols: string[]): Promise<Quote[]>;
  searchSymbols(keyword: string, market?: Market): Promise<Security[]>;
}
