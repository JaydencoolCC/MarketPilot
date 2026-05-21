import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { upsertEmailIntegration } from "@/lib/db/store";

const emailProviderSchema = z.object({
  smtpUrl: z.string().min(1).optional(),
  authCode: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().optional(),
  from: z.string().min(1),
});

export async function PUT(request: NextRequest) {
  try {
    const body = emailProviderSchema.parse(await request.json());
    const smtpUrl = body.smtpUrl ?? buildSmtpUrl(body);
    const setting = await upsertEmailIntegration({ smtpUrl, from: body.from });
    return NextResponse.json({ data: setting });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function buildSmtpUrl(input: z.infer<typeof emailProviderSchema>) {
  if (!input.authCode) return undefined;
  const host = input.host?.trim() || "smtp.qq.com";
  const port = input.port ?? 465;
  const username = input.from.trim();
  return `smtps://${encodeURIComponent(username)}:${encodeURIComponent(input.authCode.trim())}@${host}:${port}`;
}
