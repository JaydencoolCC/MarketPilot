import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteFundItem, listFundRows, updateFundHolding } from "@/lib/db/store";
import { toErrorResponse } from "@/lib/domain/errors";

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
    const item = await updateFundHolding(id, body);
    const rows = await listFundRows();
    return NextResponse.json({ data: item, funds: rows });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await deleteFundItem(id);
    const rows = await listFundRows();
    return NextResponse.json({ data: rows });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
