import { AppError } from "@/lib/domain/errors";
import type { Market, NewsArticle } from "@/lib/domain/types";
import { marketFromSymbol, normalizeSymbol } from "@/lib/domain/symbols";
import type { NewsProvider, NewsQuery } from "@/lib/providers/news/types";

type RssItem = {
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  summary: string;
};

type RawNewsItem = {
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  summary: string;
  symbols: string[];
  importanceScore: number;
};

type EastmoneyColumnResponse = {
  code?: string | number;
  message?: string;
  data?: {
    list?: EastmoneyColumnItem[];
  };
};

type EastmoneyColumnItem = {
  title?: string;
  summary?: string;
  uniqueUrl?: string;
  url?: string;
  mediaName?: string;
  showTime?: string;
};

type EastmoneyF10Response = {
  gszx?: {
    data?: {
      items?: EastmoneyF10Item[];
    };
  };
};

type EastmoneyF10Item = {
  title?: string;
  summary?: string;
  uniqueUrl?: string;
  url?: string;
  source?: string | null;
  showDateTime?: number;
  publishDate?: number;
};

export class PublicNewsProvider implements NewsProvider {
  async fetchMarketNews(input: NewsQuery): Promise<NewsArticle[]> {
    const symbols = input.symbols.map((symbol) => normalizeSymbol(symbol));
    const targets = symbols.length ? symbols : ["AAPL.US", "700.HK", "600519.SH"];
    const eastmoneyArticles = await fetchEastmoneyNews(targets);
    const shouldUseYahooFallback =
      !eastmoneyArticles.length || targets.some((symbol) => !symbol.endsWith(".SH") && !symbol.endsWith(".SZ"));
    const yahooArticles = shouldUseYahooFallback ? await fetchYahooNews(targets) : [];
    const articles = [...eastmoneyArticles, ...yahooArticles]
      .map((item, index) => toNewsArticle(item, targets, index))
      .filter((article) => withinHours(article.publishedAt, input.hours ?? 24))
      .filter((article) => matchesMarkets(article, input.markets));

    return dedupeAndSort(articles);
  }
}

async function fetchEastmoneyNews(symbols: string[]): Promise<RawNewsItem[]> {
  try {
    const stockNews = await Promise.all(symbols.slice(0, 12).map(fetchEastmoneySymbolNews));
    const marketNews = symbols.length ? [] : await fetchEastmoneyMarketNews();
    return [...stockNews.flat(), ...marketNews];
  } catch {
    return [];
  }
}

async function fetchEastmoneySymbolNews(symbol: string): Promise<RawNewsItem[]> {
  if (!symbol.endsWith(".SH") && !symbol.endsWith(".SZ")) return [];

  const url = new URL("https://emweb.securities.eastmoney.com/PC_HSF10/NewsBulletin/PageAjax");
  url.searchParams.set("code", toEastmoneyCode(symbol));
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://emweb.securities.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `东方财富个股新闻请求失败：${response.status}`, 503);
  }

  const payload = (await response.json()) as EastmoneyF10Response;
  return (payload.gszx?.data?.items ?? [])
    .map((item) => eastmoneyF10ToRawNews(item, symbol))
    .filter((item): item is RawNewsItem => Boolean(item));
}

async function fetchEastmoneyMarketNews(): Promise<RawNewsItem[]> {
  const url = new URL("https://np-listapi.eastmoney.com/comm/web/getNewsByColumns");
  url.searchParams.set("client", "web");
  url.searchParams.set("biz", "web_news_col");
  url.searchParams.set("column", "350");
  url.searchParams.set("order", "1");
  url.searchParams.set("needInteractData", "0");
  url.searchParams.set("page_index", "1");
  url.searchParams.set("page_size", "20");
  url.searchParams.set("req_trace", Date.now().toString());

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://finance.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `东方财富财经新闻请求失败：${response.status}`, 503);
  }

  const payload = (await response.json()) as EastmoneyColumnResponse;
  if (payload.code !== "1" && payload.code !== 1) {
    throw new AppError("PROVIDER_UNAVAILABLE", payload.message ?? "东方财富财经新闻不可用。", 503);
  }

  return (payload.data?.list ?? [])
    .map(eastmoneyColumnToRawNews)
    .filter((item): item is RawNewsItem => Boolean(item));
}

async function fetchYahooNews(symbols: string[]): Promise<RawNewsItem[]> {
  try {
    const feeds = await Promise.all(symbols.slice(0, 12).map(fetchYahooSymbolNews));
    return feeds.flat();
  } catch {
    return [];
  }
}

async function fetchYahooSymbolNews(symbol: string) {
  const url = new URL("https://feeds.finance.yahoo.com/rss/2.0/headline");
  url.searchParams.set("s", toYahooSymbol(symbol));
  url.searchParams.set("region", "US");
  url.searchParams.set("lang", "en-US");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "trade-workbench/0.1" },
  });
  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `公开新闻源请求失败：${response.status}`, 503);
  }

  return parseRssItems(await response.text()).map((item) => ({
    ...item,
    symbols: [symbol],
    importanceScore: 55,
  }));
}

function parseRssItems(xml: string): RssItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const item = match[1] ?? "";
    return {
      title: decodeXml(readTag(item, "title")),
      url: decodeXml(readTag(item, "link")),
      publishedAt: parseDate(readTag(item, "pubDate")),
      source: decodeXml(readTag(item, "source")) || "Yahoo Finance",
      summary: stripHtml(decodeXml(readTag(item, "description"))),
    };
  }).filter((item) => item.title && item.url);
}

function toNewsArticle(item: RawNewsItem, requestedSymbols: string[], index: number): NewsArticle {
  const symbols = inferSymbols(item, requestedSymbols);
  const market = inferMarket(symbols);
  return {
    id: `public-news-${hash(item.url)}-${index}`,
    title: item.title,
    summary: item.summary || item.title,
    url: item.url,
    source: item.source,
    symbols,
    market,
    publishedAt: item.publishedAt,
    importanceScore: item.importanceScore,
    createdAt: new Date().toISOString(),
  };
}

function eastmoneyF10ToRawNews(item: EastmoneyF10Item, symbol: string): RawNewsItem | null {
  const title = item.title?.trim();
  const url = item.uniqueUrl || item.url;
  if (!title || !url) return null;
  return {
    title,
    summary: item.summary?.trim() || title,
    url,
    source: item.source || "东方财富",
    publishedAt: parseEastmoneyTimestamp(item.showDateTime || item.publishDate),
    symbols: [symbol],
    importanceScore: 75,
  };
}

function eastmoneyColumnToRawNews(item: EastmoneyColumnItem): RawNewsItem | null {
  const title = item.title?.trim();
  const url = item.uniqueUrl || item.url;
  if (!title || !url) return null;
  return {
    title,
    summary: item.summary?.trim() || title,
    url,
    source: item.mediaName || "东方财富",
    publishedAt: parseDate(item.showTime ?? ""),
    symbols: [],
    importanceScore: 65,
  };
}

function inferSymbols(item: RawNewsItem, requestedSymbols: string[]) {
  if (item.symbols.length) return item.symbols;
  const text = `${item.title} ${item.summary}`.toUpperCase();
  const matched = requestedSymbols.filter((symbol) => {
    const raw = symbol.split(".")[0] ?? symbol;
    return text.includes(raw);
  });
  return matched.length ? matched : requestedSymbols.slice(0, 1);
}

function inferMarket(symbols: string[]): Market | "GLOBAL" {
  const first = symbols[0];
  return first ? marketFromSymbol(first) : "GLOBAL";
}

function toYahooSymbol(symbol: string) {
  if (symbol.endsWith(".US")) return symbol.replace(/\.US$/, "");
  if (symbol.endsWith(".HK")) return `${symbol.replace(/\.HK$/, "").padStart(4, "0")}.HK`;
  if (symbol.endsWith(".SH")) return symbol.replace(/\.SH$/, ".SS");
  if (symbol.endsWith(".SZ")) return symbol.replace(/\.SZ$/, ".SZ");
  return symbol;
}

function toEastmoneyCode(symbol: string) {
  const raw = symbol.split(".")[0] ?? symbol;
  if (symbol.endsWith(".SH")) return `SH${raw}`;
  if (symbol.endsWith(".SZ")) return `SZ${raw}`;
  return symbol;
}

function readTag(item: string, tag: string) {
  return new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(item)?.[1]?.trim() ?? "";
}

function decodeXml(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseEastmoneyTimestamp(value?: number) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function withinHours(publishedAt: string, hours: number) {
  return Date.now() - new Date(publishedAt).getTime() <= hours * 60 * 60 * 1000;
}

function matchesMarkets(article: NewsArticle, markets?: Array<Market | "GLOBAL">) {
  return markets?.length ? markets.includes(article.market) : true;
}

function dedupeAndSort(articles: NewsArticle[]) {
  const seen = new Set<string>();
  return articles
    .filter((article) => {
      const key = article.url || article.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function hash(value: string) {
  let hashValue = 0;
  for (const char of value) hashValue = (hashValue * 31 + char.charCodeAt(0)) >>> 0;
  return hashValue.toString(36);
}
