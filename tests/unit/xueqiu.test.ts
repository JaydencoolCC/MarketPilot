import { describe, expect, it } from "vitest";
import { fundDetailUrl, stockDetailUrl, xueqiuFundUrl, xueqiuStockUrl } from "@/lib/domain/xueqiu";

describe("xueqiuStockUrl", () => {
  it("builds Xueqiu URLs for US, HK, SH, and SZ symbols", () => {
    expect(xueqiuStockUrl("AAPL.US")).toBe("https://xueqiu.com/S/AAPL");
    expect(xueqiuStockUrl("700.HK")).toBe("https://xueqiu.com/S/00700?from=status_stock_match");
    expect(xueqiuStockUrl("1810.HK")).toBe("https://xueqiu.com/S/01810?from=status_stock_match");
    expect(xueqiuStockUrl("600519.SH")).toBe("https://xueqiu.com/S/SH600519");
    expect(xueqiuStockUrl("000001.SZ")).toBe("https://xueqiu.com/S/SZ000001");
  });

  it("builds Xueqiu URLs for mutual funds and ETF funds", () => {
    expect(xueqiuFundUrl("110022.FUND")).toBe("https://xueqiu.com/S/F110022");
    expect(xueqiuFundUrl("161128.FUND")).toBe("https://xueqiu.com/S/F161128");
    expect(xueqiuFundUrl("SPY.US")).toBe("https://xueqiu.com/S/SPY");
    expect(xueqiuFundUrl("2800.HK")).toBe("https://xueqiu.com/S/02800?from=status_stock_match");
    expect(xueqiuFundUrl("510300.SH")).toBe("https://xueqiu.com/S/SH510300");
  });

  it("uses Yahoo Finance detail URLs for Japanese securities", () => {
    expect(stockDetailUrl("^N225")).toBe("https://finance.yahoo.com/quote/%5EN225");
    expect(stockDetailUrl("7203.T")).toBe("https://finance.yahoo.com/quote/7203.T");
    expect(fundDetailUrl("7203.T")).toBe("https://finance.yahoo.com/quote/7203.T");
  });

  it("uses Xueqiu detail URLs for supported US index aliases", () => {
    expect(stockDetailUrl(".NDX.US")).toBe("https://xueqiu.com/S/.NDX");
    expect(stockDetailUrl("NDX")).toBe("https://xueqiu.com/S/.NDX");
    expect(stockDetailUrl(".INX.US")).toBe("https://xueqiu.com/S/.INX");
    expect(stockDetailUrl(".DJI.US")).toBe("https://xueqiu.com/S/.DJI");
    expect(stockDetailUrl(".IXIC.US")).toBe("https://xueqiu.com/S/.IXIC");
  });
});
