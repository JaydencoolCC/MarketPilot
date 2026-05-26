import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { normalizeFundSymbol } from "@/lib/domain/funds";
import { getLiveFundSnapshots } from "@/lib/db/store";

export async function GET(request: NextRequest) {
  try {
    const symbols = request.nextUrl.searchParams
      .get("symbols")
      ?.split(",")
      .map((symbol) => normalizeFundSymbol(symbol))
      .filter(Boolean);
    const snapshots = await getLiveFundSnapshots(symbols ?? []);
    return NextResponse.json({ data: snapshots });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
