import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/chat/route";

describe("chat API", () => {
  it("returns a structured validation error for empty messages", async () => {
    const response = await POST(
      new NextRequest("https://trade.local/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "" }),
      }),
    );
    const payload = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(payload.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "请求参数不完整或格式不正确。",
    });
  });
});
