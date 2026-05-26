import { NextResponse } from "next/server";
import { deleteFundItem, listFundRows } from "@/lib/db/store";
import { toErrorResponse } from "@/lib/domain/errors";

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
