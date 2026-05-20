import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/domain/errors";
import { upsertModelIntegration } from "@/lib/db/store";

const modelSettingSchema = z.object({
  baseUrl: z.string().url("请输入有效的 Base URL"),
  modelName: z.string().min(1, "请输入模型名称"),
  apiKey: z.string().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const body = modelSettingSchema.parse(await request.json());
    const setting = await upsertModelIntegration(body);
    return NextResponse.json({ data: setting });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
