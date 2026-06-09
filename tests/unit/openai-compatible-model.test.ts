import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleModelProvider } from "@/lib/providers/model/openai-compatible";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("OpenAI-compatible model provider", () => {
  it("uses a minimal chat prompt", async () => {
    let requestBody: unknown;
    global.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
      );
    }) as typeof fetch;

    const provider = new OpenAICompatibleModelProvider({
      baseUrl: "https://model.example.com/v1",
      apiKey: "test-key",
      modelName: "test-model",
    });

    let answer = "";
    for await (const chunk of provider.streamChat({
      question: "顺丰今天为什么波动？",
      watchlist: [],
      quotes: [
        {
          symbol: "002352.SZ",
          price: 38.1,
          change: -0.2,
          changePercent: -0.52,
          currency: "CNY",
          marketStatus: "closed",
          provider: "sina",
          quoteTime: "2026-05-22T07:00:00.000Z",
          fetchedAt: "2026-05-23T04:00:00.000Z",
          status: "ok",
        },
      ],
      articles: [
        {
          id: "article-1",
          title: "顺丰相关新闻",
          summary: "一条前一日新闻",
          url: "https://example.com/news",
          source: "public",
          symbols: ["002352.SZ"],
          market: "CN",
          publishedAt: "2026-05-22T12:00:00.000Z",
          importanceScore: 80,
          createdAt: "2026-05-22T12:10:00.000Z",
        },
      ],
      context: {
        now: "2026-05-23T04:00:00.000Z",
        timezone: "Asia/Shanghai",
        today: "2026-05-23",
        localTime: "2026/05/23 12:00:00",
      },
    })) {
      answer += chunk.content;
    }

    expect(answer).toBe("OK");

    const messages = (requestBody as { messages: Array<{ role: string; content: string }> }).messages;
    const systemPrompt = messages[0]?.content ?? "";
    const userPayload = JSON.parse(messages[1]?.content ?? "{}") as {
      context?: { today?: string; timezone?: string };
    };

    expect(systemPrompt).toBe("你是一个中文金融研究助手。");
    expect(userPayload.context).toMatchObject({
      today: "2026-05-23",
      timezone: "Asia/Shanghai",
    });
  });

  it("sends index quotes separately for digest market overview", async () => {
    let requestBody: unknown;
    global.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "今日重点财经摘要",
                sections: [{ heading: "行情速览", body: "标普500走弱。" }],
              }),
            },
          },
        ],
      });
    }) as typeof fetch;

    const provider = new OpenAICompatibleModelProvider({
      baseUrl: "https://model.example.com/v1",
      apiKey: "test-key",
      modelName: "test-model",
    });
    await provider.generateDigest({
      watchlist: [],
      quotes: [
        {
          symbol: "AAPL.US",
          price: 226.84,
          change: 2.31,
          changePercent: 1.03,
          currency: "USD",
          marketStatus: "open",
          provider: "mock",
          quoteTime: "2026-06-09T01:00:00.000Z",
          status: "ok",
        },
      ],
      indexQuotes: [
        {
          symbol: "^GSPC",
          price: 7383.74,
          change: -200.57,
          changePercent: -2.64,
          currency: "USD",
          marketStatus: "closed",
          provider: "mock",
          quoteTime: "2026-06-09T01:00:00.000Z",
          status: "ok",
        },
      ],
      articles: [],
    });

    const messages = (requestBody as { messages: Array<{ role: string; content: string }> }).messages;
    const systemPrompt = messages[0]?.content ?? "";
    const userPayload = JSON.parse(messages[1]?.content ?? "{}") as {
      quotes?: Array<{ symbol: string }>;
      indexQuotes?: Array<{ symbol: string }>;
    };

    expect(systemPrompt).toContain("“行情速览”只写 indexQuotes");
    expect(userPayload.quotes?.map((quote) => quote.symbol)).toEqual(["AAPL.US"]);
    expect(userPayload.indexQuotes?.map((quote) => quote.symbol)).toEqual(["^GSPC"]);
  });
});
