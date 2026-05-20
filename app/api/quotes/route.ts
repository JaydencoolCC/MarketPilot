import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { getLiveQuotes } from "@/lib/db/store";
import { normalizeSymbol } from "@/lib/domain/symbols";

export async function GET(request: NextRequest) {
  try {
    const symbols = request.nextUrl.searchParams
      .get("symbols")
      ?.split(",")
      .map((symbol) => normalizeSymbol(symbol))
      .filter(Boolean);
    const quotes = await getLiveQuotes(symbols ?? []);
    return NextResponse.json({ data: quotes });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
