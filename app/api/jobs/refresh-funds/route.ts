import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { runRefreshFundsJob } from "@/lib/jobs/funds";
import { assertJobRequestAuthorized } from "@/lib/utils/job-auth";

export async function POST(request: NextRequest) {
  try {
    assertJobRequestAuthorized(request);
    const result = await runRefreshFundsJob();
    return NextResponse.json({ data: result }, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
