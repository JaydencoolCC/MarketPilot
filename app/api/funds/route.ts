import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { addFundItem, listFundRows, refreshFunds } from "@/lib/db/store";

const addFundSchema = z.object({
  symbol: z.string().min(1),
  type: z.enum(["mutual_fund", "etf"]).optional(),
});

export async function GET() {
  try {
    await refreshFunds();
    const rows = await listFundRows();
    return NextResponse.json({ data: rows });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = addFundSchema.parse(await request.json());
    const item = await addFundItem(body);
    const rows = await listFundRows();
    return NextResponse.json({ data: item, funds: rows }, { status: 201 });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
