import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { sendDailyDigest } from "@/lib/jobs/digest";

export async function POST() {
  try {
    const result = await sendDailyDigest();
    return NextResponse.json({ data: result, digest: result.digest });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
