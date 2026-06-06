import { AppError } from "@/lib/domain/errors";
import type { Market, NewsArticle } from "@/lib/domain/types";
import { marketFromSymbol, normalizeSymbol } from "@/lib/domain/symbols";
import { marketDataFetch } from "@/lib/providers/market-data-network";
import type { NewsProvider, NewsQuery } from "@/lib/providers/news/types";

type AlphaVantageNewsResponse = {
  feed?: AlphaVantageArticle[];
  Information?: string;
  Note?: string;
  ["Error Message"]?: string;
};

type AlphaVantageArticle = {
  title?: string;
  url?: string;
  time_published?: string;
  authors?: string[];
  summary?: string;
  source?: string;
  ticker_sentiment?: Array<{ ticker?: string; relevance_score?: string }>;
  overall_sentiment_score?: number;
};

export class AlphaVantageNewsProvider implements NewsProvider {
  async fetchMarketNews(input: NewsQuery): Promise<NewsArticle[]> {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Alpha Vantage 配置不完整，请设置 ALPHA_VANTAGE_API_KEY。",
        503,
      );
    }

    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "NEWS_SENTIMENT");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("sort", "LATEST");
    url.searchParams.set("limit", "50");

    const tickers = alphaVantageTickers(input.symbols);
    if (tickers.length) {
      url.searchParams.set("tickers", tickers.join(","));
    }

    const response = await marketDataFetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new AppError("PROVIDER_UNAVAILABLE", "Alpha Vantage 新闻请求失败。", 503);
    }

    const payload = (await response.json()) as AlphaVantageNewsResponse;
    if (payload["Error Message"] || payload.Note || payload.Information) {
      throw new AppError(
        payload.Note ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
        payload["Error Message"] ?? payload.Note ?? payload.Information ?? "Alpha Vantage 新闻不可用。",
        payload.Note ? 429 : 503,
      );
    }

    return dedupeAndSort(
      (payload.feed ?? [])
        .map((article, index) => toNewsArticle(article, index, input.symbols))
        .filter((article): article is NewsArticle => Boolean(article))
        .filter((article) => withinHours(article.publishedAt, input.hours ?? 24))
        .filter((article) => matchesMarkets(article, input.markets)),
    );
  }
}

function alphaVantageTickers(symbols: string[]) {
  return symbols
    .map((symbol) => normalizeSymbol(symbol))
    .filter((symbol) => symbol.endsWith(".US"))
    .map((symbol) => symbol.replace(/\.US$/, ""))
    .slice(0, 20);
}

function toNewsArticle(
  article: AlphaVantageArticle,
  index: number,
  requestedSymbols: string[],
) {
  if (!article.title || !article.url) {
    return null;
  }

  const symbols = alphaSymbolsToInternal(article.ticker_sentiment, requestedSymbols);
  const market = inferMarket(symbols);
  const publishedAt = parseAlphaTimestamp(article.time_published);
  const score = Math.round(Math.max(0, Math.min(100, (article.overall_sentiment_score ?? 0) * 50 + 50)));

  return {
    id: `alpha-vantage-${index + 1}-${hash(article.url)}`,
    title: article.title,
    summary: article.summary ?? "",
    url: article.url,
    source: article.source ?? "Alpha Vantage",
    symbols,
    market,
    publishedAt: publishedAt.toISOString(),
    importanceScore: score,
    createdAt: new Date().toISOString(),
  } satisfies NewsArticle;
}

function alphaSymbolsToInternal(
  tickerSentiment: AlphaVantageArticle["ticker_sentiment"],
  requestedSymbols: string[],
) {
  const requested = new Set(requestedSymbols.map((symbol) => normalizeSymbol(symbol)));
  const converted = (tickerSentiment ?? [])
    .map((item) => item.ticker?.trim().toUpperCase())
    .filter((ticker): ticker is string => Boolean(ticker))
    .map((ticker) => `${ticker}.US`);

  const matched = converted.filter((symbol) => !requested.size || requested.has(symbol));
  return [...new Set(matched)];
}

function inferMarket(symbols: string[]): Market | "GLOBAL" {
  const first = symbols[0];
  if (!first) return "GLOBAL";
  return marketFromSymbol(first);
}

function parseAlphaTimestamp(value?: string) {
  if (!value || !/^\d{8}T\d{6}$/.test(value)) {
    return new Date();
  }

  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(9, 11);
  const minute = value.slice(11, 13);
  const second = value.slice(13, 15);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

function withinHours(publishedAt: string, hours: number) {
  return Date.now() - new Date(publishedAt).getTime() <= hours * 60 * 60 * 1000;
}

function matchesMarkets(article: NewsArticle, markets?: Array<Market | "GLOBAL">) {
  if (!markets?.length) {
    return true;
  }
  return markets.includes(article.market);
}

function dedupeAndSort(articles: NewsArticle[]) {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return articles
    .filter((article) => {
      const titleKey = article.title.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenUrls.has(article.url) || seenTitles.has(titleKey)) {
        return false;
      }
      seenUrls.add(article.url);
      seenTitles.add(titleKey);
      return true;
    })
    .sort((a, b) => {
      const importance = b.importanceScore - a.importanceScore;
      if (importance) return importance;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
}

function hash(value: string) {
  let hashValue = 0;
  for (const char of value) {
    hashValue = (hashValue * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hashValue.toString(36);
}
