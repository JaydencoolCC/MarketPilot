import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { getEmailProvider } from "@/lib/providers/email";
import { buildDigestPreview } from "@/lib/jobs/digest";

export async function POST() {
  try {
    const { setting, digest } = await buildDigestPreview();
    const result = await getEmailProvider().sendDigest({ setting, digest, test: true });
    return NextResponse.json({ data: result, digest });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
