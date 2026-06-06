import { afterEach, describe, expect, it, vi } from "vitest";
import iconv from "iconv-lite";
import { AutoQuoteProvider } from "@/lib/providers/quotes/auto";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

describe("AutoQuoteProvider", () => {
  it("uses domestic public sources before Yahoo for US quotes", async () => {
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("hq.sinajs.cn")) {
        return new Response('var hq_str_gb_aapl="AAPL,210,4,1.9417,206,212,205,213,1000000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";');
      }

      if (href.includes("push2.eastmoney.com")) {
        return Response.json({
          data: {
            diff: [{ f12: "AAPL", f13: 105, f292: 2 }],
          },
        });
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
      price: 210,
      provider: "sina",
      marketStatus: "open",
      status: "ok",
    });
  });

  it("falls back to Yahoo when the domestic public source does not return a usable quote", async () => {
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("hq.sinajs.cn")) {
        return new Response('var hq_str_gb_aapl="";');
      }

      if (href.includes("push2.eastmoney.com")) {
        return Response.json({
          data: {
            diff: [{ f12: "AAPL", f13: 105, f292: 2 }],
          },
        });
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

  it("uses Eastmoney explicit closed status when Yahoo does not provide one", async () => {
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("push2.eastmoney.com")) {
        return Response.json({
          data: {
            diff: [{ f12: "000725", f13: 0, f292: 5 }],
          },
        });
      }

      return Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "CNY",
                regularMarketPrice: 5.8,
                previousClose: 5.77,
                regularMarketTime: 1779177600,
              },
            },
          ],
          error: null,
        },
      });
    }) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes(["000725.SZ"]);

    expect(quote).toMatchObject({
      symbol: "000725.SZ",
      marketStatus: "closed",
      status: "ok",
    });
  });

  it("uses Sina before Yahoo for mainland China quotes", async () => {
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("hq.sinajs.cn")) {
        return new Response(
          'var hq_str_sz000725="京东方A,5.45,5.77,5.86,5.91,5.43,5.86,5.87,123456,123456789,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-06-03,14:30:00,00,";',
        );
      }

      if (href.includes("push2.eastmoney.com")) {
        return Response.json({
          data: {
            diff: [{ f12: "000725", f13: 0, f292: 2 }],
          },
        });
      }

      return Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "CNY",
                regularMarketPrice: 99,
                previousClose: 90,
                regularMarketTime: 1779177600,
                marketState: "REGULAR",
              },
            },
          ],
          error: null,
        },
      });
    }) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes(["000725.SZ"]);

    expect(quote).toMatchObject({
      symbol: "000725.SZ",
      price: 5.86,
      provider: "sina",
      marketStatus: "open",
      status: "ok",
    });
  });

  it("uses Eastmoney explicit pre-market status", async () => {
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("push2.eastmoney.com")) {
        return Response.json({
          data: {
            diff: [{ f12: "AAPL", f13: 105, f292: 11 }],
          },
        });
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
      marketStatus: "pre_market",
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

  it("filters Japanese market searches away from US-listed Japan ETFs", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="Amundi Index Solutions - Amundi JPX-Nikkei 400,41,jpny,jpny,Amundi Index Solutions - Amundi JPX-Nikkei 400,,Amundi Index Solutions - Amundi JPX-Nikkei 400,99,1,,,;iShares Currency Hedged JPX-Nikkei 400 ETF,41,hjpx,hjpx,iShares Currency Hedged JPX-Nikkei 400 ETF,,iShares Currency Hedged JPX-Nikkei 400 ETF,99,1,,,";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new AutoQuoteProvider().searchSymbols("Nikkei Stock Average", "JP");

    expect(results[0]).toMatchObject({
      symbol: "^N225",
      normalizedSymbol: "^N225",
      market: "JP",
    });
    expect(results.every((item) => item.market === "JP")).toBe(true);
    expect(results.map((item) => item.normalizedSymbol)).not.toContain("JPNY.US");
  });

  it("infers Japanese market open status when Yahoo omits marketState during Tokyo trading hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T03:43:00.000Z"));
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "JPY",
                regularMarketPrice: 2904,
                previousClose: 2844,
                regularMarketTime: 1779177600,
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes(["7203.T"]);

    expect(quote).toMatchObject({
      symbol: "7203.T",
      provider: "yahoo",
      marketStatus: "open",
      status: "ok",
    });

    vi.useRealTimers();
  });

  it("infers US market closed status when quote sources omit market state outside New York trading hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T07:10:00.000Z"));
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("push2.eastmoney.com")) {
        return Response.json({ data: { diff: [] } });
      }

      if (href.includes("hq.sinajs.cn")) {
        return new Response('var hq_str_gb_ko="KO,78.41,0,0,78.41,78.41,78.41,78.41,1000000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";');
      }

      return new Response("", { status: 404 });
    }) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes(["KO.US"]);

    expect(quote).toMatchObject({
      symbol: "KO.US",
      provider: "sina",
      marketStatus: "closed",
      status: "ok",
    });

    vi.useRealTimers();
  });

  it("infers US index regular trading status when Yahoo omits marketState", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T15:10:00.000Z"));
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("push2.eastmoney.com")) {
        return Response.json({ data: { diff: [] } });
      }

      if (href.includes("hq.sinajs.cn")) {
        return new Response('var hq_str_gb_^ndx="";');
      }

      return Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "USD",
                regularMarketPrice: 30660.6,
                previousClose: 30500,
                regularMarketTime: 1779177600,
              },
            },
          ],
          error: null,
        },
      });
    }) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes([".NDX.US"]);

    expect(quote).toMatchObject({
      symbol: "^NDX",
      provider: "yahoo",
      marketStatus: "open",
      status: "ok",
    });

    vi.useRealTimers();
  });

  it("infers Japanese market closed status during the Tokyo lunch break", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T03:00:00.000Z"));
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "JPY",
                regularMarketPrice: 2904,
                previousClose: 2844,
                regularMarketTime: 1779177600,
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    const [quote] = await new AutoQuoteProvider().getQuotes(["7203.T"]);

    expect(quote).toMatchObject({
      symbol: "7203.T",
      provider: "yahoo",
      marketStatus: "closed",
      status: "ok",
    });

    vi.useRealTimers();
  });
});
