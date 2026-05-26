import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markIntegrationTest } from "@/lib/db/store";
import { AppError, toErrorResponse } from "@/lib/domain/errors";
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
      const message = providerTestErrorMessage(error);
      const setting = await markIntegrationTest(kind, "failed", message);
      const response = toErrorResponse(error);
      return NextResponse.json(
        {
          ...response.body,
          error: {
            code: response.body.error.code,
            message,
          },
          data: setting,
        },
        { status: response.status },
      );
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
    const failed = quotes.find((quote) => quote.status !== "ok");
    if (failed) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        failed.errorMessage ?? "行情 provider 返回了失败状态。",
        503,
      );
    }
    return `行情连接正常，返回 ${quotes.length} 条样例。`;
  }

  if (kind === "news") {
    const articles = await getNewsProvider().fetchMarketNews({ symbols: ["AAPL.US"], hours: 24 });
    return `新闻连接正常，返回 ${articles.length} 条样例。`;
  }

  return (await getEmailProvider()).verifyConnection();
}

function providerTestErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "连接测试失败。";
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const reason = cause?.code ?? cause?.message;
  if (reason === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
    return "连接失败：本机 Node 运行时无法验证 HTTPS 证书链。请配置 NODE_EXTRA_CA_CERTS 或使用 conda 环境证书后重启服务。";
  }
  return reason ? `${error.message}（${reason}）` : error.message;
}
