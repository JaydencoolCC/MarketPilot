import { afterEach, describe, expect, it, vi } from "vitest";
import { YahooQuoteProvider } from "@/lib/providers/quotes/yahoo";
import { resetStoreForTests } from "@/lib/db/store";
import { saveMarketDataNetworkSetting } from "@/lib/providers/market-data-network";

const { undiciFetch } = vi.hoisted(() => ({
  undiciFetch: vi.fn(),
}));

vi.mock("undici", () => ({
  fetch: undiciFetch,
  ProxyAgent: class MockProxyAgent {
    constructor(public readonly uri: string) {}
  },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  undiciFetch.mockReset();
  resetStoreForTests();
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

  it("keeps Tokyo symbols unchanged for Yahoo Finance", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "JPY",
                regularMarketPrice: 2988,
                previousClose: 2957,
                marketState: "CLOSED",
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    const [quote] = await new YahooQuoteProvider().getQuotes(["7203.T"]);

    expect(quote).toMatchObject({
      symbol: "7203.T",
      price: 2988,
      currency: "JPY",
      provider: "yahoo",
      status: "ok",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining("/7203.T?") }),
      expect.any(Object),
    );
  });

  it("keeps supported Japanese index symbols unchanged for Yahoo Finance", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "JPY",
                regularMarketPrice: 38112,
                previousClose: 37980,
                marketState: "CLOSED",
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    const [quote] = await new YahooQuoteProvider().getQuotes(["^N225"]);

    expect(quote).toMatchObject({
      symbol: "^N225",
      price: 38112,
      currency: "JPY",
      provider: "yahoo",
      status: "ok",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining("/%5EN225?") }),
      expect.any(Object),
    );
  });

  it("normalizes Nasdaq 100 index aliases for Yahoo Finance", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "USD",
                regularMarketPrice: 18000,
                previousClose: 17900,
                marketState: "REGULAR",
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    const [quote] = await new YahooQuoteProvider().getQuotes([".NDX"]);

    expect(quote).toMatchObject({
      symbol: "^NDX",
      price: 18000,
      currency: "USD",
      provider: "yahoo",
      status: "ok",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining("/%5ENDX?") }),
      expect.any(Object),
    );
  });

  it("retries Yahoo quote requests through the market data proxy", async () => {
    saveMarketDataNetworkSetting({ proxyUrl: "7897" });
    global.fetch = vi.fn(async () => new Response("forbidden", { status: 403 })) as typeof fetch;
    undiciFetch.mockResolvedValue(Response.json({
      chart: {
        result: [
          {
            meta: {
              currency: "JPY",
              regularMarketPrice: 2988,
              previousClose: 2957,
              marketState: "REGULAR",
            },
          },
        ],
        error: null,
      },
    }));

    const [quote] = await new YahooQuoteProvider().getQuotes(["7203.T"]);

    expect(quote).toMatchObject({
      symbol: "7203.T",
      price: 2988,
      currency: "JPY",
      status: "ok",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(undiciFetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      dispatcher: expect.any(Object),
    }));
  });
});
