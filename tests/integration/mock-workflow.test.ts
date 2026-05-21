import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getQuotes } from "@/app/api/quotes/route";
import { GET as getNews } from "@/app/api/news/route";
import { POST as postChat } from "@/app/api/chat/route";
import { POST as previewDigest } from "@/app/api/digests/preview/route";
import { POST as sendTestDigest } from "@/app/api/digests/send-test/route";
import { POST as sendDigest } from "@/app/api/digests/send/route";
import { PUT as putEmailSetting } from "@/app/api/settings/email/route";
import { POST as testProvider } from "@/app/api/settings/providers/test/route";
import { POST as addWatchlist, GET as listWatchlist } from "@/app/api/watchlist/route";
import { DELETE as deleteWatchlist } from "@/app/api/watchlist/[id]/route";
import { sendDailyDigest } from "@/lib/jobs/digest";
import { listRecentChatMessages, resetStoreForTests } from "@/lib/db/store";

const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
  NEWS_PROVIDER: process.env.NEWS_PROVIDER,
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
};
const originalFetch = global.fetch;

beforeEach(() => {
  resetStoreForTests();
  process.env.QUOTE_PROVIDER = "mock";
  process.env.NEWS_PROVIDER = "mock";
  process.env.MODEL_PROVIDER = "mock";
  process.env.EMAIL_PROVIDER = "mock";
});

afterEach(() => {
  global.fetch = originalFetch;
  resetStoreForTests();
  restoreEnv("QUOTE_PROVIDER", previousEnv.QUOTE_PROVIDER);
  restoreEnv("NEWS_PROVIDER", previousEnv.NEWS_PROVIDER);
  restoreEnv("MODEL_PROVIDER", previousEnv.MODEL_PROVIDER);
  restoreEnv("EMAIL_PROVIDER", previousEnv.EMAIL_PROVIDER);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe("mock provider workflow", () => {
  it("runs the MVP path from watchlist to quotes, news, digest email, and chat", async () => {
    for (const symbol of ["AAPL.US", "700.HK", "600519.SH"]) {
      const response = await addWatchlist(jsonRequest("https://trade.local/api/watchlist", { symbol }));
      expect(response.status).toBe(201);
    }

    const watchlistResponse = await listWatchlist();
    const watchlistPayload = (await watchlistResponse.json()) as {
      data: Array<{ id: string; normalizedSymbol: string; quote?: { status: string } }>;
    };
    expect(watchlistPayload.data.map((row) => row.normalizedSymbol)).toEqual([
      "600519.SH",
      "700.HK",
      "AAPL.US",
    ]);
    expect(watchlistPayload.data.every((row) => row.quote?.status === "ok")).toBe(true);

    const deletedResponse = await deleteWatchlist(
      new Request(`https://trade.local/api/watchlist/${watchlistPayload.data[0].id}`),
      { params: Promise.resolve({ id: watchlistPayload.data[0].id }) },
    );
    const deletedPayload = (await deletedResponse.json()) as {
      data: Array<{ normalizedSymbol: string }>;
    };
    expect(deletedPayload.data.map((row) => row.normalizedSymbol)).toEqual(["700.HK", "AAPL.US"]);

    await addWatchlist(jsonRequest("https://trade.local/api/watchlist", { symbol: "600519.SH" }));

    const quotesResponse = await getQuotes(
      new NextRequest("https://trade.local/api/quotes?symbols=AAPL.US,700.HK,600519.SH"),
    );
    const quotesPayload = (await quotesResponse.json()) as {
      data: Array<{ symbol: string; provider: string; status: string }>;
    };
    expect(quotesPayload.data).toHaveLength(3);
    expect(quotesPayload.data.every((quote) => quote.provider === "mock")).toBe(true);

    const newsResponse = await getNews(
      new NextRequest("https://trade.local/api/news?symbols=AAPL.US,700.HK,600519.SH&hours=24"),
    );
    const newsPayload = (await newsResponse.json()) as { data: Array<{ title: string }> };
    expect(newsPayload.data.length).toBeGreaterThan(0);

    const emailResponse = await putEmailSetting(
      new NextRequest("https://trade.local/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          recipientEmail: "me@example.com",
          sendTime: "08:30",
          timezone: "Asia/Shanghai",
          markets: ["US", "HK", "CN"],
          watchlistOnly: true,
        }),
      }),
    );
    expect(emailResponse.status).toBe(200);

    const previewResponse = await previewDigest();
    const previewPayload = (await previewResponse.json()) as {
      data: { title: string; generatedAt: string; sections: unknown[] };
    };
    expect(previewPayload.data.title).toBeTruthy();
    expect(previewPayload.data.generatedAt).toBeTruthy();
    expect(previewPayload.data.sections.length).toBeGreaterThan(0);

    const sendTestResponse = await sendTestDigest();
    const sendTestPayload = (await sendTestResponse.json()) as {
      data: { status: string; message: string };
    };
    expect(sendTestPayload.data).toMatchObject({
      status: "mocked",
      message: "测试邮件已在 mock provider 中模拟发送。",
    });

    const firstDigestResponse = await sendDigest();
    const firstDigestPayload = (await firstDigestResponse.json()) as {
      data: { status: string; message: string };
    };
    expect(firstDigestPayload.data).toMatchObject({
      status: "sent",
      message: "每日摘要已在 mock provider 中模拟发送。",
    });

    const duplicateDigest = await sendDailyDigest();
    expect(duplicateDigest).toMatchObject({
      status: "skipped",
      message: "今天的每日摘要已经发送过，不会重复发送。",
    });

    const chatResponse = await postChat(
      jsonRequest("https://trade.local/api/chat", {
        message: "今天我的自选股有什么重要变化？",
      }),
    );
    expect(chatResponse.status).toBe(200);

    const chatText = await readTextStream(chatResponse);
    expect(chatText).toContain("我会先看价格变化");
    expect(chatText).toContain("不是买卖建议");
    expect(chatText).not.toContain("结论：");

    const history = await listRecentChatMessages(4);
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it("reports the default quote integration as a real auto provider", async () => {
    delete process.env.QUOTE_PROVIDER;
    global.fetch = vi.fn(async () =>
      Response.json({
        chart: {
          result: [
            {
              meta: {
                currency: "USD",
                regularMarketPrice: 200,
                previousClose: 190,
                marketState: "REGULAR",
              },
            },
          ],
          error: null,
        },
      }),
    ) as typeof fetch;

    const response = await testProvider(
      jsonRequest("https://trade.local/api/settings/providers/test", { kind: "quote" }),
    );
    const payload = (await response.json()) as {
      data: { kind: string; provider: string; source: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      kind: "quote",
      provider: "auto",
      source: "env",
      status: "success",
    });
  });

  it("marks the auto quote integration failed when public sources return no quote", async () => {
    delete process.env.QUOTE_PROVIDER;
    global.fetch = vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch;

    const response = await testProvider(
      jsonRequest("https://trade.local/api/settings/providers/test", { kind: "quote" }),
    );
    const payload = (await response.json()) as {
      data: { kind: string; provider: string; status: string; statusMessage: string };
    };

    expect(response.status).toBe(503);
    expect(payload.data).toMatchObject({
      kind: "quote",
      provider: "auto",
      status: "failed",
    });
    expect(payload.data.statusMessage).toContain("真实行情源暂时不可用");
  });

  it("returns friendly provider status when a real integration is unavailable", async () => {
    process.env.QUOTE_PROVIDER = "unavailable";

    const response = await testProvider(
      jsonRequest("https://trade.local/api/settings/providers/test", { kind: "quote" }),
    );
    const payload = (await response.json()) as {
      data: { kind: string; status: string; statusMessage: string; source: string };
    };

    expect(response.status).toBe(503);
    expect(payload.data).toMatchObject({
      kind: "quote",
      status: "failed",
      source: "env",
    });
    expect(payload.data.statusMessage).toContain("真实行情 provider 尚未接入");
  });
});
