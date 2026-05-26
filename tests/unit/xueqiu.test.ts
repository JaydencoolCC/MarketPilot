import { describe, expect, it } from "vitest";
import { xueqiuFundUrl, xueqiuStockUrl } from "@/lib/domain/xueqiu";

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
});
