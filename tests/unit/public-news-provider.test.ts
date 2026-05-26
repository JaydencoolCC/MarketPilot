import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicNewsProvider } from "@/lib/providers/news/public";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("PublicNewsProvider", () => {
  it("maps Eastmoney stock news into internal news articles first", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        gszx: {
          data: {
            items: [
              {
                title: "今天，A股有这个特点！",
                uniqueUrl: "http://finance.eastmoney.com/a/202605203743247549.html",
                summary: "上午市场成交额榜前列个股多数上涨。",
                showDateTime: Date.now(),
              },
            ],
          },
        },
      }),
    ) as typeof fetch;

    const articles = await new PublicNewsProvider().fetchMarketNews({
      symbols: ["600519.SH"],
      hours: 24,
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      title: "今天，A股有这个特点！",
      url: "http://finance.eastmoney.com/a/202605203743247549.html",
      source: "东方财富",
      symbols: ["600519.SH"],
      market: "CN",
      importanceScore: 75,
    });
  });

  it("falls back to Yahoo Finance RSS when Eastmoney has no matching source", async () => {
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("eastmoney")) {
        return Response.json({ gszx: { data: { items: [] } } });
      }
      return new Response(`
        <rss><channel>
          <item>
            <title><![CDATA[Apple shares move after supplier update]]></title>
            <link>https://finance.yahoo.com/news/apple</link>
            <pubDate>${new Date().toUTCString()}</pubDate>
            <source>Reuters</source>
            <description><![CDATA[Apple supplier commentary.]]></description>
          </item>
        </channel></rss>
      `);
    }) as typeof fetch;

    const articles = await new PublicNewsProvider().fetchMarketNews({
      symbols: ["AAPL.US"],
      hours: 24,
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      title: "Apple shares move after supplier update",
      url: "https://finance.yahoo.com/news/apple",
      source: "Reuters",
      symbols: ["AAPL.US"],
      market: "US",
    });
  });

  it("returns an empty list when no public news source returns usable articles", async () => {
    global.fetch = vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch;

    await expect(
      new PublicNewsProvider().fetchMarketNews({ symbols: ["AAPL.US"], hours: 24 }),
    ).resolves.toEqual([]);
  });
});
