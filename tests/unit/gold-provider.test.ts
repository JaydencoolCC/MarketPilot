import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PublicGoldProvider, setGoldHistoryFetcherForTest } from "@/lib/providers/gold/public";
import { GET as getGoldHistory } from "@/app/api/gold/history/route";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  setGoldHistoryFetcherForTest(null);
});

describe("PublicGoldProvider", () => {
  it("maps public gold history to international gold data", async () => {
    setGoldHistoryFetcherForTest(async () => goldPoints([2000, 2010, 2020]));

    const history = await new PublicGoldProvider().getHistory({ scope: "international", range: "1m" });

    expect(history).toMatchObject({
      scope: "international",
      currency: "USD",
      unit: "盎司",
      currentPrice: 2020,
      change: 20,
      changePercent: 1,
    });
    expect(history.points).toHaveLength(3);
  });

  it("converts gold history to CNY per gram for domestic scope", async () => {
    setGoldHistoryFetcherForTest(async () => goldPoints([2000, 2020]));
    global.fetch = vi.fn(async (url) => {
      const href = url instanceof URL ? url.href : String(url);
      if (href.includes("open.er-api.com")) {
        return Response.json({ result: "success", rates: { CNY: 7.2 } });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const history = await new PublicGoldProvider().getHistory({ scope: "domestic", range: "1m" });

    expect(history).toMatchObject({
      scope: "domestic",
      currency: "CNY",
      unit: "克",
      provider: "vang.today+open-er-api",
    });
    expect(history.currentPrice).toBeCloseTo(467.6, 1);
  });
});

describe("gold history API", () => {
  it("accepts one-day range", async () => {
    setGoldHistoryFetcherForTest(async () => goldPoints([2000, 2020]));

    const response = await getGoldHistory(new NextRequest("https://trade.local/api/gold/history?range=1d"));
    const payload = (await response.json()) as { data?: { range: string } };

    expect(response.status).toBe(200);
    expect(payload.data?.range).toBe("1d");
  });

  it("rejects invalid query values", async () => {
    const response = await getGoldHistory(new NextRequest("https://trade.local/api/gold/history?scope=bad"));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

function goldPoints(closes: number[]) {
  return closes.map((close, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      date: new Date(`2026-05-${day}T00:00:00.000Z`).toISOString(),
      price: close,
    };
  });
}
