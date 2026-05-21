import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoQuoteProvider } from "@/lib/providers/quotes/auto";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("AutoQuoteProvider", () => {
  it("uses a real public quote source before falling back", async () => {
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

    const [quote] = await new AutoQuoteProvider().getQuotes(["AAPL.US"]);

    expect(quote).toMatchObject({
      symbol: "AAPL.US",
      price: 200,
      provider: "auto:yahoo",
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
});
