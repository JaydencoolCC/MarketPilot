import type { FundHolding, FundSearchResult, FundSnapshot } from "@/lib/domain/types";

export interface FundProvider {
  searchFunds(keyword: string): Promise<FundSearchResult[]>;
  getFundSnapshots(symbols: string[]): Promise<FundSnapshot[]>;
  getFundHoldings(symbol: string): Promise<FundHolding[]>;
}
