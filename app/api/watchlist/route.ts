import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { addWatchlistItem, listWatchlistRows, refreshQuotes } from "@/lib/db/store";

const addWatchlistSchema = z.object({
  symbol: z.string().min(1),
  market: z.enum(["US", "HK", "CN", "JP"]).optional(),
});

export async function GET() {
  try {
    await refreshQuotes();
    const rows = await listWatchlistRows();
    return NextResponse.json({ data: rows });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = addWatchlistSchema.parse(await request.json());
    const item = await addWatchlistItem(body);
    const rows = await listWatchlistRows();
    return NextResponse.json({ data: item, watchlist: rows }, { status: 201 });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
