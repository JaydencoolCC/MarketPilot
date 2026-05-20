import { describe, expect, it } from "vitest";
import { MockModelProvider } from "@/lib/providers/model/mock";
import { MockNewsProvider } from "@/lib/providers/news/mock";
import { MockQuoteProvider } from "@/lib/providers/quotes/mock";

describe("mock providers", () => {
  it("returns quote data for MVP sample symbols", async () => {
    const quotes = await new MockQuoteProvider().getQuotes(["AAPL.US", "700.HK", "600519.SH"]);
    expect(quotes).toHaveLength(3);
    expect(quotes[0]).toMatchObject({ symbol: "AAPL.US", provider: "mock", status: "ok" });
  });

  it("returns relevant news for watchlist symbols", async () => {
    const articles = await new MockNewsProvider().fetchMarketNews({
      symbols: ["AAPL.US", "700.HK"],
      hours: 24,
    });
    expect(articles.length).toBeGreaterThan(0);
    expect(articles[0]?.importanceScore).toBeGreaterThan(0);
  });

  it("generates a digest with sections", async () => {
    const quotes = await new MockQuoteProvider().getQuotes(["AAPL.US"]);
    const articles = await new MockNewsProvider().fetchMarketNews({ symbols: ["AAPL.US"] });
    const digest = await new MockModelProvider().generateDigest({
      watchlist: [],
      quotes,
      articles,
    });
    expect(digest.title).toContain("财经摘要");
    expect(digest.sections.length).toBeGreaterThanOrEqual(3);
  });

  it("uses recent chat history in mock chat responses", async () => {
    const provider = new MockModelProvider();
    let answer = "";

    for await (const chunk of provider.streamChat({
      question: "继续分析",
      watchlist: [],
      quotes: [],
      articles: [],
      history: [
        {
          id: "history-1",
          role: "user",
          content: "上一轮问题",
          createdAt: new Date().toISOString(),
        },
      ],
    })) {
      answer += chunk.content;
    }

    expect(answer).toContain("最近 1 条对话上下文");
  });
});
