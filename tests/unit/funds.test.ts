import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import iconv from "iconv-lite";
import { addFundItem, deleteFundItem, listFundRows, resetStoreForTests, searchFunds } from "@/lib/db/store";
import { fundFromSymbol, fundTypeFromSymbol, normalizeFundSymbol } from "@/lib/domain/funds";
import { PublicFundProvider } from "@/lib/providers/funds/public";

const originalFetch = global.fetch;
const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
  FUND_PROVIDER: process.env.FUND_PROVIDER,
};

beforeEach(() => {
  resetStoreForTests();
  process.env.QUOTE_PROVIDER = "mock";
  process.env.FUND_PROVIDER = "public";
});

afterEach(() => {
  global.fetch = originalFetch;
  resetStoreForTests();
  restoreEnv("QUOTE_PROVIDER", previousEnv.QUOTE_PROVIDER);
  restoreEnv("FUND_PROVIDER", previousEnv.FUND_PROVIDER);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("fund symbols", () => {
  it("recognizes mutual funds and ETF symbols", () => {
    expect(normalizeFundSymbol("110022")).toBe("110022.FUND");
    expect(normalizeFundSymbol("161128")).toBe("161128.FUND");
    expect(normalizeFundSymbol("510300")).toBe("510300.SH");
    expect(normalizeFundSymbol("SPY")).toBe("SPY.US");
    expect(fundTypeFromSymbol("110022.FUND")).toBe("mutual_fund");
    expect(fundTypeFromSymbol("SPY.US")).toBe("etf");
    expect(fundFromSymbol("2800.HK")).toMatchObject({ type: "etf", market: "HK" });
  });
});

describe("PublicFundProvider", () => {
  it("maps Eastmoney fund data to fund snapshots", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        'jsonpgz({"fundcode":"110022","name":"易方达消费行业股票","jzrq":"2026-05-22","dwjz":"4.1234","gsz":"4.1567","gszzl":"1.23","gztime":"2026-05-22 15:00"});',
      ),
    ) as typeof fetch;

    const [snapshot] = await new PublicFundProvider().getFundSnapshots(["110022.FUND"]);

    expect(snapshot).toMatchObject({
      symbol: "110022.FUND",
      netValue: 4.1234,
      estimateValue: 4.1567,
      changePercent: 1.23,
      provider: "eastmoney",
      status: "ok",
    });
  });

  it("maps Eastmoney fund holdings to fund composition", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        `var apidata={ content:"截止至：<font class='px12'>2026-03-31</font><table><tbody><tr><td>1</td><td><a>600519</a></td><td class='tol'><a>贵州茅台</a></td><td></td><td></td><td></td><td class='tor'>9.90%</td><td class='tor'>86.66</td><td class='tor'>125,656.71</td></tr><tr><td>2</td><td><a>000333</a></td><td class='tol'><a>美的集团</a></td><td></td><td></td><td></td><td class='tor'>9.64%</td><td class='tor'>1,601.52</td><td class='tor'>122,275.90</td></tr></tbody></table>",arryear:[]};`,
      ),
    ) as typeof fetch;

    const holdings = await new PublicFundProvider().getFundHoldings("110022.FUND");

    expect(holdings).toEqual([
      expect.objectContaining({
        rank: 1,
        symbol: "600519",
        name: "贵州茅台",
        weightPercent: 9.9,
        asOfDate: "2026-03-31",
        provider: "eastmoney",
      }),
      expect.objectContaining({
        rank: 2,
        symbol: "000333",
        name: "美的集团",
        weightPercent: 9.64,
      }),
    ]);
  });

  it("searches Eastmoney funds by Chinese index keywords", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        Datas: [
          {
            CODE: "513500",
            NAME: "标普500ETF",
            FundBaseInfo: { FCODE: "513500", SHORTNAME: "标普500ETF", FTYPE: "指数型-海外股票" },
          },
          {
            CODE: "159941",
            NAME: "纳指ETF",
            FundBaseInfo: { FCODE: "159941", SHORTNAME: "纳指ETF", FTYPE: "指数型-海外股票" },
          },
          {
            CODE: "050025",
            NAME: "博时标普500ETF联接A",
            FundBaseInfo: { FCODE: "050025", SHORTNAME: "博时标普500ETF联接A", FTYPE: "QDII" },
          },
        ],
      }),
    ) as typeof fetch;

    const results = await new PublicFundProvider().searchFunds("标普");

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ normalizedSymbol: "513500.SH", type: "etf", name: "标普500ETF" }),
      expect.objectContaining({ normalizedSymbol: "159941.SZ", type: "etf", name: "纳指ETF" }),
      expect.objectContaining({ normalizedSymbol: "050025.FUND", type: "mutual_fund", name: "博时标普500ETF联接A" }),
    ]));
  });

  it("keeps QDII-LOF index funds as mutual funds when searching Eastmoney", async () => {
    global.fetch = vi.fn(async () =>
      Response.json({
        Datas: [
          {
            CODE: "012868",
            NAME: "易方达标普信息科技指数(QDII-LOF)C(人民币)",
            FundBaseInfo: {
              FCODE: "012868",
              SHORTNAME: "易方达标普信息科技指数(QDII-LOF)C(人民币)",
              FTYPE: "指数型-海外股票",
            },
          },
          {
            CODE: "161128",
            NAME: "易方达标普信息科技指数(QDII-LOF)A(人民币)",
            FundBaseInfo: {
              FCODE: "161128",
              SHORTNAME: "易方达标普信息科技指数(QDII-LOF)A(人民币)",
              FTYPE: "指数型-海外股票",
            },
          },
        ],
      }),
    ) as typeof fetch;

    const results = await new PublicFundProvider().searchFunds("易方达标普信息科技指数");

    expect(results).toEqual([
      expect.objectContaining({ normalizedSymbol: "012868.FUND", type: "mutual_fund" }),
      expect.objectContaining({ normalizedSymbol: "161128.FUND", type: "mutual_fund" }),
      expect.objectContaining({ normalizedSymbol: "003721.FUND", type: "mutual_fund" }),
      expect.objectContaining({ normalizedSymbol: "012869.FUND", type: "mutual_fund" }),
    ]);
    expect(results.map((item) => item.normalizedSymbol)).not.toContain("161128.SZ");
  });

  it("falls back to Eastmoney fund code list for mutual fund search", async () => {
    global.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("FundSearchAPI")) {
        return Response.json({ Datas: [] });
      }
      if (url.includes("fundcode_search.js")) {
        return new Response('var r = [["202105","NFGHHBZA/B","南方广利回报债券A/B","债券型","NFGH"]];');
      }
      return new Response('var suggestvalue="";');
    }) as typeof fetch;

    const results = await new PublicFundProvider().searchFunds("南方广利");

    expect(results[0]).toMatchObject({
      code: "202105",
      normalizedSymbol: "202105.FUND",
      type: "mutual_fund",
      name: "南方广利回报债券A/B",
    });
  });

  it("adds Sina listed fund suggestions for ETF search", async () => {
    global.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("FundSearchAPI")) {
        return Response.json({ Datas: [] });
      }
      if (url.includes("fundcode_search.js")) {
        return new Response("var r = [];");
      }
      return new Response(new Uint8Array(iconv.encode(
        'var suggestvalue="标普500ETF,11,513500,sh513500,标普500ETF,biaopu500ETF;贵州茅台,11,600519,sh600519,贵州茅台,guizhoumaotai";',
        "gb18030",
      )));
    }) as typeof fetch;

    const results = await new PublicFundProvider().searchFunds("标普500");

    expect(results).toContainEqual(expect.objectContaining({
      code: "513500",
      normalizedSymbol: "513500.SH",
      type: "etf",
      name: "标普500ETF",
    }));
    expect(results.map((item) => item.normalizedSymbol)).not.toContain("600519.SH");
  });
});

describe("fund store", () => {
  it("adds, lists, and deletes mutual funds", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        'jsonpgz({"fundcode":"110022","name":"易方达消费行业股票","jzrq":"2026-05-22","dwjz":"4.1234","gsz":"4.1567","gszzl":"1.23","gztime":"2026-05-22 15:00"});',
      ),
    ) as typeof fetch;

    const item = await addFundItem({ symbol: "110022" });
    const rows = await listFundRows();

    expect(item).toMatchObject({ normalizedSymbol: "110022.FUND", type: "mutual_fund" });
    expect(rows[0]).toMatchObject({
      normalizedSymbol: "110022.FUND",
      dataStatus: "ok",
      snapshot: { netValue: 4.1234 },
    });

    await deleteFundItem(item.id);
    await expect(listFundRows()).resolves.toHaveLength(0);
  });

  it("uses provider search names when adding unknown mutual funds", async () => {
    global.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("FundSearchAPI")) {
        return Response.json({
          Datas: [
            {
              CODE: "202105",
              NAME: "南方广利回报债券A/B",
              FundBaseInfo: { FCODE: "202105", SHORTNAME: "南方广利回报债券A/B" },
            },
          ],
        });
      }
      return new Response(
        'jsonpgz({"fundcode":"202105","name":"南方广利回报债券A/B","jzrq":"2026-05-22","dwjz":"2.2000","gsz":"2.2100","gszzl":"0.47","gztime":"2026-05-22 15:00"});',
      );
    }) as typeof fetch;

    const item = await addFundItem({ symbol: "202105" });

    expect(item).toMatchObject({
      normalizedSymbol: "202105.FUND",
      name: "南方广利回报债券A/B",
    });
  });

  it("adds ETF funds using the quote provider", async () => {
    const item = await addFundItem({ symbol: "SPY" });
    const [row] = await listFundRows();

    expect(item).toMatchObject({ normalizedSymbol: "SPY.US", type: "etf" });
    expect(row?.snapshot?.provider).toBe("mock");
    expect(row?.dataStatus).toBe("ok");
  });

  it("searches known funds", async () => {
    await expect(searchFunds("SPY")).resolves.toEqual([
      expect.objectContaining({ normalizedSymbol: "SPY.US", type: "etf" }),
    ]);
  });
});
