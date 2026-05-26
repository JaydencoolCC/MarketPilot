import { describe, expect, it } from "vitest";
import {
  marketFromSymbol,
  normalizeSymbol,
  searchKnownSecurities,
  securityFromSymbol,
} from "@/lib/domain/symbols";

describe("symbol normalization", () => {
  it("normalizes US symbols", () => {
    expect(normalizeSymbol("aapl", "US")).toBe("AAPL.US");
    expect(securityFromSymbol("AAPL", "US")).toMatchObject({
      normalizedSymbol: "AAPL.US",
      market: "US",
      currency: "USD",
    });
  });

  it("normalizes Hong Kong symbols", () => {
    expect(normalizeSymbol("00700", "HK")).toBe("700.HK");
    expect(securityFromSymbol("700", "HK")).toMatchObject({
      normalizedSymbol: "700.HK",
      market: "HK",
      currency: "HKD",
    });
  });

  it("normalizes China A-share symbols", () => {
    expect(normalizeSymbol("600519", "CN")).toBe("600519.SH");
    expect(normalizeSymbol("000001", "CN")).toBe("000001.SZ");
    expect(marketFromSymbol("600519.SH")).toBe("CN");
  });

  it("extracts selected display labels and rejects non-symbol text", () => {
    expect(normalizeSymbol("中国电信 · 601728.SH")).toBe("601728.SH");
    expect(() => normalizeSymbol("中国电信")).toThrow("请输入有效股票代码");
  });

  it("searches securities by company name and returns concrete market choices", () => {
    const results = searchKnownSecurities("中国电信");
    expect(results.map((item) => item.normalizedSymbol)).toContain("728.HK");
    expect(results.map((item) => item.normalizedSymbol)).toContain("601728.SH");
  });

  it("resolves common HK and A-share symbols to company names", () => {
    expect(securityFromSymbol("000001.SH").name).toBe("上证指数");
    expect(securityFromSymbol("1810.HK").name).toBe("小米集团-W");
    expect(securityFromSymbol("000725.SZ").name).toBe("京东方A");
    expect(securityFromSymbol("000876.SZ").name).toBe("新希望");
    expect(securityFromSymbol("002352.SZ").name).toBe("顺丰控股");
  });

  it("searches securities by Chinese aliases for US stocks", () => {
    expect(searchKnownSecurities("特斯拉").map((item) => item.normalizedSymbol)).toContain("TSLA.US");
    expect(searchKnownSecurities("谷歌").map((item) => item.normalizedSymbol)).toContain("GOOGL.US");
    expect(searchKnownSecurities("亚马逊").map((item) => item.normalizedSymbol)).toContain("AMZN.US");
  });
});
