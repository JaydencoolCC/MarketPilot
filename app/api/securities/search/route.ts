import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { getQuoteProvider } from "@/lib/providers/quotes";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const data = await getQuoteProvider().searchSymbols(query);
    return NextResponse.json({ data: data.slice(0, 8) });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
