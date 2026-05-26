import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { getGoldProvider } from "@/lib/providers/gold";

const goldQuerySchema = z.object({
  scope: z.enum(["international", "domestic"]).default("international"),
  range: z.enum(["1d", "1m", "3m", "6m", "1y"]).default("3m"),
});

export async function GET(request: NextRequest) {
  try {
    const query = goldQuerySchema.parse({
      scope: request.nextUrl.searchParams.get("scope") ?? undefined,
      range: request.nextUrl.searchParams.get("range") ?? undefined,
    });
    const history = await getGoldProvider().getHistory(query);
    return NextResponse.json({ data: history });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
