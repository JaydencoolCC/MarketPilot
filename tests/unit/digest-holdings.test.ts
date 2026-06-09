import { describe, expect, it } from "vitest";
import { buildHoldingsDigestSection } from "@/lib/jobs/digest-holdings";

describe("digest holdings section", () => {
  it("formats stock and fund holdings into a stable digest section", () => {
    const section = buildHoldingsDigestSection({
      stocks: [
        {
          id: "stock-1",
          symbol: "AAPL",
          normalizedSymbol: "AAPL.US",
          market: "US",
          name: "Apple",
          currency: "USD",
          costPrice: 200,
          shares: 2,
          createdAt: "2026-06-09T00:00:00.000Z",
          updatedAt: "2026-06-09T00:00:00.000Z",
          quote: {
            symbol: "AAPL.US",
            price: 226.84,
            change: 2.31,
            changePercent: 1.03,
            currency: "USD",
            marketStatus: "open",
            provider: "mock",
            quoteTime: "2026-06-09T00:00:00.000Z",
            status: "ok",
          },
          todayNewsCount: 0,
          dataStatus: "ok",
        },
      ],
      funds: [
        {
          id: "fund-1",
          code: "110022",
          normalizedSymbol: "110022.FUND",
          type: "mutual_fund",
          name: "易方达消费行业股票",
          currency: "CNY",
          costPrice: 4,
          shares: 1000,
          createdAt: "2026-06-09T00:00:00.000Z",
          updatedAt: "2026-06-09T00:00:00.000Z",
          snapshot: {
            symbol: "110022.FUND",
            netValue: 4.12,
            estimateValue: 4.15,
            changePercent: 1.2,
            currency: "CNY",
            provider: "mock",
            quoteTime: "2026-06-09T00:00:00.000Z",
            status: "ok",
          },
          dataStatus: "ok",
        },
      ],
    });

    expect(section?.heading).toBe("当前持仓");
    expect(section?.body).toContain("Apple（AAPL.US）");
    expect(section?.body).toContain("易方达消费行业股票（110022.FUND）");
    expect(section?.body).toContain("当前市值");
    expect(section?.body).toContain("今日收益");
    expect(section?.body).toContain("浮动盈亏");
  });
});
