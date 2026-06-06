import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import {
  getMarketDataNetworkSetting,
  marketDataFetch,
  saveMarketDataNetworkSetting,
} from "@/lib/providers/market-data-network";

const networkSettingSchema = z.object({
  proxyUrl: z.string().optional(),
});

export async function GET() {
  return NextResponse.json({ data: getMarketDataNetworkSetting() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = networkSettingSchema.parse(await request.json());
    return NextResponse.json({ data: saveMarketDataNetworkSetting(body) });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = networkSettingSchema.parse(await request.json());
    const setting = saveMarketDataNetworkSetting(body);
    if (!setting.proxyUrl) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "请先填写代理地址。" } },
        { status: 400 },
      );
    }

    const url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/7203.T");
    url.searchParams.set("range", "1d");
    url.searchParams.set("interval", "1d");
    const response = await marketDataFetch(url, {
      cache: "no-store",
      proxyOnly: true,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0",
      },
    });

    return NextResponse.json({
      data: setting,
      result: { message: `代理连接正常，Yahoo 返回 ${response.status}。` },
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
