import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWatchlistItems, refreshQuotes } from "@/lib/db/store";
import { getModelProvider } from "@/lib/providers/model";
import { createChatRuntimeContext } from "@/lib/providers/model/runtime-context";
import { getNewsProvider } from "@/lib/providers/news";
import { toErrorResponse } from "@/lib/domain/errors";
import type { ChatMessage } from "@/lib/domain/types";

const chatSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        createdAt: z.string(),
      }),
    )
    .max(12)
    .optional(),
});

const CHAT_CONTEXT_TIMEOUT_MS = 6000;

export async function POST(request: NextRequest) {
  try {
    const body = chatSchema.parse(await request.json());
    const watchlist = await getWatchlistItems();
    const symbols = watchlist.map((item) => item.normalizedSymbol);
    const [quotes, articles] = await Promise.all([
      fallbackOnSlowOrFailed(refreshQuotes(symbols), [], CHAT_CONTEXT_TIMEOUT_MS),
      fallbackOnSlowOrFailed(
        getNewsProvider().fetchMarketNews({
          symbols,
          hours: 72,
        }),
        [],
        CHAT_CONTEXT_TIMEOUT_MS,
      ),
    ]);
    const stream = (await getModelProvider()).streamChat({
      question: body.message,
      watchlist,
      quotes,
      articles,
      context: createChatRuntimeContext(),
      history: normalizeHistory(body.history ?? []),
      signal: request.signal,
    });

    const encoder = new TextEncoder();

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              controller.enqueue(encoder.encode(chunk.content));
            }
            controller.close();
          } catch (error) {
            const message =
              error instanceof Error
                ? `模型暂时不可用：${error.message}`
                : "模型暂时不可用，可以稍后重试。";
            controller.enqueue(encoder.encode(message));
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      },
    );
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

async function fallbackOnSlowOrFailed<T>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeHistory(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-8)
    .map((message) => ({
      ...message,
      content: message.content.slice(0, 2000),
    }));
}
