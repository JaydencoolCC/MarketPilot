import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { normalizeSymbol } from "@/lib/domain/symbols";
import { getNewsProvider } from "@/lib/providers/news";

export async function GET(request: NextRequest) {
  try {
    const symbols = request.nextUrl.searchParams
      .get("symbols")
      ?.split(",")
      .map((symbol) => normalizeSymbol(symbol))
      .filter(Boolean) ?? [];
    const hours = Number(request.nextUrl.searchParams.get("hours") ?? 24);
    const articles = await getNewsProvider().fetchMarketNews({
      symbols,
      hours: Number.isFinite(hours) && hours > 0 ? hours : 24,
    });
    return NextResponse.json({ data: articles });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
