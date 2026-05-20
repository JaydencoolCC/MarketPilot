import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markIntegrationTest } from "@/lib/db/store";
import { toErrorResponse } from "@/lib/domain/errors";
import type { IntegrationKind } from "@/lib/domain/types";
import { getEmailProvider } from "@/lib/providers/email";
import { getNewsProvider } from "@/lib/providers/news";
import { getQuoteProvider } from "@/lib/providers/quotes";
import { testModelConnection } from "@/lib/providers/model";

const providerTestSchema = z.object({
  kind: z.enum(["model", "quote", "news", "email"]),
});

export async function POST(request: NextRequest) {
  let kind: IntegrationKind | null = null;
  try {
    const parsed = providerTestSchema.parse(await request.json());
    kind = parsed.kind;
    const message = await runProviderTest(kind);
    const setting = await markIntegrationTest(kind, "success", message);
    return NextResponse.json({ data: setting });
  } catch (error) {
    if (kind) {
      const message = error instanceof Error ? error.message : "连接测试失败。";
      const setting = await markIntegrationTest(kind, "failed", message);
      return NextResponse.json({ data: setting }, { status: 200 });
    }
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

async function runProviderTest(kind: IntegrationKind) {
  if (kind === "model") {
    const result = await testModelConnection();
    if (!result.ok) throw new Error(result.message);
    return result.message;
  }

  if (kind === "quote") {
    const quotes = await getQuoteProvider().getQuotes(["AAPL.US"]);
    return `行情连接正常，返回 ${quotes.length} 条样例。`;
  }

  if (kind === "news") {
    const articles = await getNewsProvider().fetchMarketNews({ symbols: ["AAPL.US"], hours: 24 });
    return `新闻连接正常，返回 ${articles.length} 条样例。`;
  }

  const result = await getEmailProvider().sendDigest({
    test: true,
    setting: {
      id: "provider-test",
      enabled: false,
      recipientEmail: "test@example.com",
      sendTime: "08:30",
      timezone: "Asia/Shanghai",
      markets: ["US"],
      watchlistOnly: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    digest: {
      title: "连接测试",
      generatedAt: new Date().toISOString(),
      sections: [{ heading: "测试", body: "这是一封 provider 连接测试。" }],
    },
  });
  return result.message;
}
