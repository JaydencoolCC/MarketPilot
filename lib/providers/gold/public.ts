import { AppError } from "@/lib/domain/errors";
import type { GoldHistory, GoldPoint, GoldRange, GoldScope } from "@/lib/domain/types";
import type { GoldProvider } from "@/lib/providers/gold/types";

type VangHistoryResponse = {
  success?: boolean;
  history?: Array<{
    date?: string;
    prices?: {
      XAUUSD?: {
        buy?: number;
      };
    };
  }>;
};

type ExchangeRateResponse = {
  result?: string;
  rates?: {
    CNY?: number;
  };
};

const TROY_OUNCE_GRAMS = 31.1034768;

export class PublicGoldProvider implements GoldProvider {
  async getHistory(input: { scope: GoldScope; range: GoldRange }): Promise<GoldHistory> {
    const goldPoints = trimPointsForRange(await goldHistoryFetcher(input.range), input.range);
    const points =
      input.scope === "domestic" ? convertToCnyPerGram(goldPoints, await fetchUsdCnyRate()) : goldPoints;
    if (points.length < 2) {
      throw new AppError("PROVIDER_UNAVAILABLE", "黄金历史价格暂时不可用。", 503);
    }

    const first = points[0];
    const last = points[points.length - 1];
    const change = Number((last.price - first.price).toFixed(4));
    const changePercent = first.price ? Number(((change / first.price) * 100).toFixed(6)) : 0;

    return {
      scope: input.scope,
      range: input.range,
      currency: input.scope === "domestic" ? "CNY" : "USD",
      unit: input.scope === "domestic" ? "克" : "盎司",
      provider: input.scope === "domestic" ? "vang.today+open-er-api" : "vang.today",
      updatedAt: new Date(last.date).toISOString(),
      currentPrice: Number(last.price.toFixed(4)),
      change,
      changePercent,
      points: points.map((point) => ({ ...point, price: Number(point.price.toFixed(4)) })),
    };
  }
}

async function fetchVangGoldSeries(range: GoldRange): Promise<GoldPoint[]> {
  const url = new URL("https://www.vang.today/api/prices");
  url.searchParams.set("type", "XAUUSD");
  url.searchParams.set("days", daysForRange(range));

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "trade-workbench/0.1",
    },
  });
  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `黄金历史价格请求失败：${response.status}`, 503);
  }

  const payload = (await response.json()) as VangHistoryResponse;
  if (!payload.success || !payload.history?.length) {
    throw new AppError("PROVIDER_UNAVAILABLE", "黄金历史价格未返回有效数据。", 503);
  }

  return payload.history
    .flatMap((item) => {
      const price = Number(item.prices?.XAUUSD?.buy);
      const date = item.date;
      if (!date || !Number.isFinite(price) || price <= 0) return [];
      return [{ date: new Date(`${date}T00:00:00.000Z`).toISOString(), price }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

let goldHistoryFetcher = fetchVangGoldSeries;

export function setGoldHistoryFetcherForTest(fetcher: ((range: GoldRange) => Promise<GoldPoint[]>) | null) {
  goldHistoryFetcher = fetcher ?? fetchVangGoldSeries;
}

async function fetchUsdCnyRate() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "trade-workbench/0.1",
    },
  });
  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `USD/CNY 汇率请求失败：${response.status}`, 503);
  }

  const payload = (await response.json()) as ExchangeRateResponse;
  const rate = payload.rates?.CNY;
  if (payload.result !== "success" || !rate || !Number.isFinite(rate)) {
    throw new AppError("PROVIDER_UNAVAILABLE", "USD/CNY 汇率未返回有效数据。", 503);
  }
  return rate;
}

function convertToCnyPerGram(points: GoldPoint[], usdCnyRate: number) {
  return points.map((point) => ({
    date: point.date,
    price: (point.price * usdCnyRate) / TROY_OUNCE_GRAMS,
  }));
}

function daysForRange(range: GoldRange) {
  if (range === "1d") return "1";
  if (range === "1m") return "30";
  if (range === "3m") return "90";
  if (range === "6m") return "180";
  return "365";
}

function trimPointsForRange(points: GoldPoint[], range: GoldRange) {
  if (points.length < 2) return points;

  const lastTime = new Date(points[points.length - 1].date).getTime();
  const cutoffTime = lastTime - Number(daysForRange(range)) * 24 * 60 * 60 * 1000;
  return points.filter((point) => new Date(point.date).getTime() >= cutoffTime);
}
