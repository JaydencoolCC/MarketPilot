import { afterEach, describe, expect, it, vi } from "vitest";
import { YahooQuoteProvider } from "@/lib/providers/quotes/yahoo";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("YahooQuoteProvider", () => {
  it("maps Yahoo chart data to internal quote shape", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
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
      }),
    ) as typeof fetch;

    const [quote] = await new YahooQuoteProvider().getQuotes(["TSLA.US"]);

    expect(quote).toMatchObject({
      symbol: "TSLA.US",
      price: 200,
      change: 10,
      changePercent: 5.263158,
      provider: "yahoo",
      marketStatus: "open",
      status: "ok",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining("/TSLA?") }),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("maps Shanghai and Hong Kong symbols to Yahoo symbols", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "CNY",
                regularMarketPrice: 7,
                previousClose: 6.5,
                marketState: "CLOSED",
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    await new YahooQuoteProvider().getQuotes(["601728.SH", "700.HK"]);

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ href: expect.stringContaining("/601728.SS?") }),
      expect.any(Object),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ href: expect.stringContaining("/0700.HK?") }),
      expect.any(Object),
    );
  });
});
