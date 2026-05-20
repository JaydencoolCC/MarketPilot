import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { buildDigestPreview } from "@/lib/jobs/digest";

export async function POST() {
  try {
    const { digest } = await buildDigestPreview();
    return NextResponse.json({ data: digest });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
