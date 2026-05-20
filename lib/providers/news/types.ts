import type { Market, NewsArticle } from "@/lib/domain/types";

export type NewsQuery = {
  symbols: string[];
  markets?: Array<Market | "GLOBAL">;
  hours?: number;
};

export interface NewsProvider {
  fetchMarketNews(input: NewsQuery): Promise<NewsArticle[]>;
}
