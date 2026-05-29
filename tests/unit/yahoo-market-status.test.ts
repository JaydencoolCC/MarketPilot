import { afterEach, describe, expect, it, vi } from "vitest";
import { YahooQuoteProvider } from "@/lib/providers/quotes/yahoo";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("YahooQuoteProvider market status", () => {
  it("does not infer closed status when Yahoo omits marketState", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "USD",
                regularMarketPrice: 100,
                previousClose: 99,
                regularMarketTime: 1779177600,
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    const [quote] = await new YahooQuoteProvider().getQuotes(["AAPL.US"]);

    expect(quote.marketStatus).toBe("unknown");
  });
});
