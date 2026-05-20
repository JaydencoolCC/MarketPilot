import { NextResponse } from "next/server";
import { markIntegrationTest } from "@/lib/db/store";
import { toErrorResponse } from "@/lib/domain/errors";
import { testModelConnection } from "@/lib/providers/model";

export async function POST() {
  try {
    const result = await testModelConnection();
    const setting = await markIntegrationTest("model", result.ok ? "success" : "failed", result.message);
    return NextResponse.json({ data: setting, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型连接测试失败。";
    const setting = await markIntegrationTest("model", "failed", message);
    const response = toErrorResponse(error);
    return NextResponse.json({ ...response.body, data: setting }, { status: response.status });
  }
}
