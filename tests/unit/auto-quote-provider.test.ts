import { afterEach, describe, expect, it, vi } from "vitest";
import iconv from "iconv-lite";
import { AutoQuoteProvider } from "@/lib/providers/quotes/auto";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("AutoQuoteProvider", () => {
  it("uses a real public quote source before falling back", async () => {
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("push2.eastmoney.com")) {
        return Response.json({ data: { f292: 2 } });
      }

      return Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "USD",
                regularMarketPrice: 200,
                previousClose: 190,
                regularMarketTime: 1779177600,
                marketState: "REGULAR",
              },
            },
          ],
          error: null,
        },
      });
    }) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes(["AAPL.US"]);

    expect(quote).toMatchObject({
      symbol: "AAPL.US",
      price: 200,
      provider: "yahoo",
      marketStatus: "open",
      status: "ok",
    });
  });

  it("returns an error quote when public quote sources are unavailable", async () => {
    global.fetch = vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes(["AAPL.US"]);

    expect(quote).toMatchObject({
      symbol: "AAPL.US",
      provider: "auto",
      status: "error",
      errorCode: "PROVIDER_UNAVAILABLE",
    });
    expect(quote?.errorMessage).toContain("真实行情源暂时不可用");
  });

  it("prioritizes the main stock over derivative-like search results", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="特斯拉,41,tsla,tsla,特斯拉,,特斯拉,99,1,,,;特斯拉每日2倍做多股票ETF,41,tsll,tsll,特斯拉每日2倍做多股票ETF,,特斯拉每日2倍做多股票ETF,99,1,,,;特斯拉1倍做空ETF,41,tsli,tsli,特斯拉1倍做空ETF,,特斯拉1倍做空ETF,99,1,,,";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new AutoQuoteProvider().searchSymbols("特斯拉");

    expect(results[0]).toMatchObject({
      symbol: "TSLA",
      normalizedSymbol: "TSLA.US",
      market: "US",
    });
    expect(results.slice(1).some((item) => item.normalizedSymbol === "TSLL.US")).toBe(true);
  });
});
