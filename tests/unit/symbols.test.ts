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
    expect(normalizeSymbol("sz002475")).toBe("002475.SZ");
    expect(normalizeSymbol("sh600519")).toBe("600519.SH");
    expect(marketFromSymbol("600519.SH")).toBe("CN");
  });

  it("normalizes Japanese stock symbols", () => {
    expect(normalizeSymbol("7203", "JP")).toBe("7203.T");
    expect(normalizeSymbol("7203.T")).toBe("7203.T");
    expect(marketFromSymbol("7203.T")).toBe("JP");
    expect(securityFromSymbol("7203.T")).toMatchObject({
      normalizedSymbol: "7203.T",
      market: "JP",
      currency: "JPY",
    });
  });

  it("keeps supported Japanese index symbols for Yahoo Finance", () => {
    expect(normalizeSymbol("^N225")).toBe("^N225");
    expect(marketFromSymbol("^N225")).toBe("JP");
    expect(securityFromSymbol("^N225")).toMatchObject({
      symbol: "^N225",
      normalizedSymbol: "^N225",
      market: "JP",
      currency: "JPY",
    });
  });

  it("normalizes common US index aliases for Yahoo Finance", () => {
    expect(normalizeSymbol(".NDX")).toBe("^NDX");
    expect(normalizeSymbol(".NDX.US")).toBe("^NDX");
    expect(normalizeSymbol("NDX")).toBe("^NDX");
    expect(normalizeSymbol("NDX.US")).toBe("^NDX");
    expect(normalizeSymbol(".INX.US")).toBe("^GSPC");
    expect(normalizeSymbol("SPX")).toBe("^GSPC");
    expect(normalizeSymbol(".DJI.US")).toBe("^DJI");
    expect(normalizeSymbol(".IXIC.US")).toBe("^IXIC");
    expect(marketFromSymbol("^NDX")).toBe("US");
    expect(marketFromSymbol("^GSPC")).toBe("US");
    expect(securityFromSymbol(".NDX")).toMatchObject({
      symbol: "^NDX",
      normalizedSymbol: "^NDX",
      market: "US",
      name: "Nasdaq 100",
      currency: "USD",
    });
    expect(securityFromSymbol(".INX.US")).toMatchObject({
      symbol: "^GSPC",
      normalizedSymbol: "^GSPC",
      market: "US",
      name: "S&P 500",
      currency: "USD",
    });
  });

  it("rejects unknown dot-prefixed index aliases instead of creating fake US symbols", () => {
    expect(() => normalizeSymbol(".FOO")).toThrow("暂不支持该指数代码");
    expect(() => normalizeSymbol(".FOO.US")).toThrow("暂不支持该指数代码");
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
    expect(securityFromSymbol("002475.SZ").name).toBe("立讯精密");
  });

  it("searches securities by Chinese aliases for US stocks", () => {
    expect(searchKnownSecurities("特斯拉").map((item) => item.normalizedSymbol)).toContain("TSLA.US");
    expect(searchKnownSecurities("谷歌").map((item) => item.normalizedSymbol)).toContain("GOOGL.US");
    expect(searchKnownSecurities("亚马逊").map((item) => item.normalizedSymbol)).toContain("AMZN.US");
  });

  it("searches Japanese stocks by Chinese aliases", () => {
    expect(searchKnownSecurities("丰田").map((item) => item.normalizedSymbol)).toContain("7203.T");
  });

  it("searches Japanese indexes by common names", () => {
    expect(searchKnownSecurities("Nikkei Stock Average", "JP").map((item) => item.normalizedSymbol)).toContain("^N225");
    expect(searchKnownSecurities("日经", "JP").map((item) => item.normalizedSymbol)).toContain("^N225");
  });

  it("searches US indexes by common names", () => {
    expect(searchKnownSecurities("纳指100", "US").map((item) => item.normalizedSymbol)).toContain("^NDX");
    expect(searchKnownSecurities("Nasdaq 100", "US").map((item) => item.normalizedSymbol)).toContain("^NDX");
  });
});
