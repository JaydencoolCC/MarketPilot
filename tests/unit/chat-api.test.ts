import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/chat/route";
import { resetStoreForTests } from "@/lib/db/store";

const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
  NEWS_PROVIDER: process.env.NEWS_PROVIDER,
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
};

beforeEach(() => {
  resetStoreForTests();
  process.env.QUOTE_PROVIDER = "mock";
  process.env.NEWS_PROVIDER = "mock";
  process.env.MODEL_PROVIDER = "mock";
});

afterEach(() => {
  resetStoreForTests();
  restoreEnv("QUOTE_PROVIDER", previousEnv.QUOTE_PROVIDER);
  restoreEnv("NEWS_PROVIDER", previousEnv.NEWS_PROVIDER);
  restoreEnv("MODEL_PROVIDER", previousEnv.MODEL_PROVIDER);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function readTextStream(response: Response) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";

  if (!reader) return text;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  return text;
}

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

  it("accepts recent chat history and streams a follow-up response", async () => {
    const response = await POST(
      new NextRequest("https://trade.local/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "继续分析",
          history: [
            {
              id: "previous-user",
              role: "user",
              content: "上一轮问题",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const text = await readTextStream(response);
    expect(text).toContain("最近 1 条对话上下文");
  });
});
