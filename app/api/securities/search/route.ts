import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { getQuoteProvider } from "@/lib/providers/quotes";

const marketSchema = z.enum(["US", "HK", "CN", "JP"]).optional();

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const market = marketSchema.parse(request.nextUrl.searchParams.get("market") ?? undefined);
    const data = await getQuoteProvider().searchSymbols(query, market);
    return NextResponse.json({ data: data.slice(0, 8) });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
