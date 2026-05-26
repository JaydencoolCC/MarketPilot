import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { listWatchlistRows, updateWatchlistHolding } from "@/lib/db/store";

const holdingSchema = z.object({
  costPrice: z.number().nullable().optional(),
  shares: z.number().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = holdingSchema.parse(await request.json());
    const item = await updateWatchlistHolding(id, body);
    const rows = await listWatchlistRows();
    return NextResponse.json({ data: item, watchlist: rows });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
