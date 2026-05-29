import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { runDailyDigestJob } from "@/lib/jobs/digest";

export async function POST(_request: NextRequest) {
  try {
    const result = await runDailyDigestJob();
    return NextResponse.json({ data: result }, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
