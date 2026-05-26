import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { normalizeFundSymbol } from "@/lib/domain/funds";
import { getFundProvider } from "@/lib/providers/funds";

export async function GET(request: NextRequest) {
  try {
    const symbol = normalizeFundSymbol(request.nextUrl.searchParams.get("symbol") ?? "");
    const data = await getFundProvider().getFundHoldings(symbol);
    return NextResponse.json({ data });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
