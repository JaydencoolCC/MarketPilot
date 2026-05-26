import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWatchlistItems, refreshQuotes } from "@/lib/db/store";
import { getModelProvider } from "@/lib/providers/model";
import { createChatRuntimeContext } from "@/lib/providers/model/runtime-context";
import { getNewsProvider } from "@/lib/providers/news";
import { toErrorResponse } from "@/lib/domain/errors";

const chatSchema = z.object({
  message: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = chatSchema.parse(await request.json());

    const watchlist = await getWatchlistItems();
    const quotes = await refreshQuotes(watchlist.map((item) => item.normalizedSymbol));
    const articles = await getNewsProvider().fetchMarketNews({
      symbols: watchlist.map((item) => item.normalizedSymbol),
      hours: 72,
    });
    const stream = (await getModelProvider()).streamChat({
      question: body.message,
      watchlist,
      quotes,
      articles,
      context: createChatRuntimeContext(),
      history: [],
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
