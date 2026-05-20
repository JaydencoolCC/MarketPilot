import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlphaVantageNewsProvider } from "@/lib/providers/news/alpha-vantage";

const originalFetch = global.fetch;
const previousApiKey = process.env.ALPHA_VANTAGE_API_KEY;

beforeEach(() => {
  process.env.ALPHA_VANTAGE_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (previousApiKey === undefined) {
    delete process.env.ALPHA_VANTAGE_API_KEY;
  } else {
    process.env.ALPHA_VANTAGE_API_KEY = previousApiKey;
  }
});

describe("Alpha Vantage news provider", () => {
  it("maps provider feed into deduped internal articles", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        feed: [
          {
            title: "Apple supply chain update",
            url: "https://example.com/apple",
            time_published: "20260519T080000",
            summary: "Supply chain commentary.",
            source: "Example Wire",
            overall_sentiment_score: 0.3,
            ticker_sentiment: [{ ticker: "AAPL", relevance_score: "0.9" }],
          },
          {
            title: "Apple supply chain update",
            url: "https://example.com/apple-copy",
            time_published: "20260519T081000",
            summary: "Duplicate title.",
            source: "Example Wire",
            ticker_sentiment: [{ ticker: "AAPL", relevance_score: "0.9" }],
          },
        ],
      }),
    ) as typeof fetch;

    const articles = await new AlphaVantageNewsProvider().fetchMarketNews({
      symbols: ["AAPL.US"],
      hours: 100000,
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      title: "Apple supply chain update",
      source: "Example Wire",
      symbols: ["AAPL.US"],
      market: "US",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("function=NEWS_SENTIMENT"),
      }),
      { cache: "no-store" },
    );
  });
});
