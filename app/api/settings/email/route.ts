import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { getEmailSetting, updateEmailSetting } from "@/lib/db/store";

const emailSettingSchema = z.object({
  enabled: z.boolean(),
  recipientEmail: z.string().email().or(z.literal("")),
  sendTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
  markets: z.array(z.enum(["US", "HK", "CN", "JP"])).min(1),
  watchlistOnly: z.boolean(),
});

export async function GET() {
  return NextResponse.json({ data: await getEmailSetting() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = emailSettingSchema.parse(await request.json());
    const setting = await updateEmailSetting(body);
    return NextResponse.json({ data: setting });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
