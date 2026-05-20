import type { NewsArticle } from "@/lib/domain/types";
import type { NewsProvider, NewsQuery } from "@/lib/providers/news/types";

const NEWS_FIXTURES: Array<Omit<NewsArticle, "id" | "createdAt" | "publishedAt"> & { ageHours: number }> = [
  {
    title: "大型科技股财报预期继续支撑美股风险偏好",
    summary: "市场关注云计算、AI 基础设施和消费电子需求，科技权重股仍是指数波动的核心来源。",
    url: "https://example.com/market/us-tech-earnings",
    source: "Mock Market Wire",
    symbols: ["AAPL.US", "MSFT.US", "NVDA.US"],
    market: "US",
    importanceScore: 92,
    ageHours: 2,
  },
  {
    title: "港股互联网板块成交活跃，资金继续关注回购和利润率",
    summary: "腾讯、阿里等互联网公司成为港股市场讨论焦点，投资者关注广告、游戏和云业务变化。",
    url: "https://example.com/market/hk-internet",
    source: "Mock Asia Finance",
    symbols: ["700.HK", "9988.HK"],
    market: "HK",
    importanceScore: 86,
    ageHours: 5,
  },
  {
    title: "白酒与银行板块分化，A股资金偏好仍较谨慎",
    summary: "市场继续观察消费复苏和稳增长政策节奏，贵州茅台和平安银行相关板块表现分化。",
    url: "https://example.com/market/cn-consumption-bank",
    source: "Mock China Desk",
    symbols: ["600519.SH", "000001.SZ"],
    market: "CN",
    importanceScore: 78,
    ageHours: 7,
  },
  {
    title: "全球市场等待主要央行政策信号",
    summary: "利率路径、美元指数和风险资产估值仍是跨市场定价的关键变量。",
    url: "https://example.com/market/global-rates",
    source: "Mock Macro Brief",
    symbols: [],
    market: "GLOBAL",
    importanceScore: 74,
    ageHours: 10,
  },
];

export class MockNewsProvider implements NewsProvider {
  async fetchMarketNews(input: NewsQuery): Promise<NewsArticle[]> {
    const now = Date.now();
    const symbols = new Set(input.symbols);
    const markets = new Set(input.markets ?? ["US", "HK", "CN", "GLOBAL"]);
    const maxAgeHours = input.hours ?? 24;

    return NEWS_FIXTURES.filter((article) => article.ageHours <= maxAgeHours)
      .filter((article) => markets.has(article.market))
      .filter((article) => {
        if (article.market === "GLOBAL") return true;
        if (!symbols.size) return true;
        return article.symbols.some((symbol) => symbols.has(symbol));
      })
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .map((article, index) => ({
        ...article,
        id: `mock-news-${index + 1}`,
        publishedAt: new Date(now - article.ageHours * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(now).toISOString(),
      }));
  }
}
