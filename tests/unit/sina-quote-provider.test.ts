import { afterEach, describe, expect, it, vi } from "vitest";
import iconv from "iconv-lite";
import { SinaQuoteProvider } from "@/lib/providers/quotes/sina";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("SinaQuoteProvider", () => {
  it("searches public Sina suggestions for A-share names", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="顺丰控股,11,002352,sz002352,顺丰控股,shunfengkonggu";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () =>
      new Response(body),
    ) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("顺丰");

    expect(results[0]).toMatchObject({
      name: "顺丰控股",
      symbol: "002352",
      normalizedSymbol: "002352.SZ",
      market: "CN",
      currency: "CNY",
    });
  });

  it("uses the company name field when Sina returns a code-like display name", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="sz002475,11,002475,sz002475,立讯精密,lixunjingmi";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("002475", "CN");

    expect(results[0]).toMatchObject({
      name: "立讯精密",
      symbol: "002475",
      normalizedSymbol: "002475.SZ",
      market: "CN",
      currency: "CNY",
    });
  });

  it("can save remote names for A-share symbols that are not in the local known list", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="sz300750,11,300750,sz300750,宁德时代,ningdeshidai";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("300750", "CN");

    expect(results[0]).toMatchObject({
      name: "宁德时代",
      symbol: "300750",
      normalizedSymbol: "300750.SZ",
      market: "CN",
      currency: "CNY",
    });
  });

  it("keeps local known securities as a fallback when search is unavailable", async () => {
    global.fetch = vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("中国电信");

    expect(results.map((item) => item.normalizedSymbol)).toContain("601728.SH");
  });

  it("filters non-stock China suggestions", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="顺丰控股,11,002352,sz002352,顺丰控股,shunfengkonggu;24顺丰02,11,148817,sz148817,24顺丰02";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("顺丰");

    expect(results.map((item) => item.normalizedSymbol)).toEqual(["002352.SZ"]);
  });

  it("parses Hong Kong stock suggestions", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="小米集团-Ｗ,31,01810,01810,小米集团-Ｗ,,小米集团-Ｗ,99,1,ESG,,";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("小米");

    expect(results[0]).toMatchObject({
      name: "小米集团-W",
      symbol: "1810",
      normalizedSymbol: "1810.HK",
      market: "HK",
      currency: "HKD",
    });
  });

  it("prioritizes US stock suggestions for ticker input", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="TSLA,41,tsla,tsla,特斯拉,,特斯拉,99,1,ESG,,;退市拉夏,11,603157,sh603157,退市拉夏,,退市拉夏,99,0,,,";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("TSLA");

    expect(results[0]).toMatchObject({
      symbol: "TSLA",
      normalizedSymbol: "TSLA.US",
      market: "US",
      currency: "USD",
    });
  });

  it("prioritizes exact local alias matches over remote ADR matches", async () => {
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="腾讯,41,tcehy,tcehy,腾讯,,腾讯,99,1,,,;腾讯控股,31,00700,00700,腾讯控股,,腾讯控股,99,1,ESG,,";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const results = await new SinaQuoteProvider().searchSymbols("腾讯");

    expect(results[0]).toMatchObject({
      normalizedSymbol: "700.HK",
      market: "HK",
      name: "腾讯控股",
    });
  });

  it("does not infer market status when Sina does not return an explicit state", async () => {
    const body =
      'var hq_str_sz000725="京东方A,4.69,4.69,5.16,5.16,4.69,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-05-22,14:30:00,00,";';
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const [quote] = await new SinaQuoteProvider().getQuotes(["000725.SZ"]);
    expect(quote).toMatchObject({
      symbol: "000725.SZ",
      marketStatus: "unknown",
    });
  });
});
