import { AppError } from "@/lib/domain/errors";
import type { DigestPreview } from "@/lib/domain/types";
import { resolveModelConfig } from "@/lib/providers/model/config";
import { MockModelProvider } from "@/lib/providers/model/mock";
import { OpenAICompatibleModelProvider } from "@/lib/providers/model/openai-compatible";
import { createChatRuntimeContext } from "@/lib/providers/model/runtime-context";
import type { ChatChunk, ChatRequest, DigestPrompt, ModelProvider } from "@/lib/providers/model/types";

class UnimplementedModelProvider implements ModelProvider {
  async *streamChat(_input: ChatRequest): AsyncIterable<ChatChunk> {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "真实模型尚未配置，请填写 Base URL、模型名称和 API Key。",
      503,
    );
  }

  async generateDigest(_input: DigestPrompt): Promise<DigestPreview> {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "真实模型尚未配置，请填写 Base URL、模型名称和 API Key。",
      503,
    );
  }
}

export async function getModelProvider(): Promise<ModelProvider> {
  const config = await resolveModelConfig();

  if (config.provider === "mock") {
    return new MockModelProvider();
  }

  if (config.baseUrl && config.apiKey && config.modelName) {
    return new OpenAICompatibleModelProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
    });
  }

  return new UnimplementedModelProvider();
}

export async function testModelConnection() {
  const config = await resolveModelConfig();

  if (config.provider === "mock") {
    return {
      ok: false,
      message: "真实模型未配置，请填写 Base URL、模型名称和 API Key。",
      source: config.source,
    };
  }

  if (!config.baseUrl || !config.apiKey || !config.modelName) {
    return {
      ok: false,
      message: "模型配置不完整，请填写 Base URL、模型名称和 API Key。",
      source: config.source,
    };
  }

  const provider = new OpenAICompatibleModelProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelName: config.modelName,
  });
  const chunks: string[] = [];

  for await (const chunk of provider.streamChat({
    question: "请只回复 OK，用于连接测试。",
    watchlist: [],
    quotes: [],
    articles: [],
    context: createChatRuntimeContext(),
  })) {
    chunks.push(chunk.content);
    if (chunks.join("").length >= 12) break;
  }

  return {
    ok: true,
    message: "模型连接测试成功。",
    source: config.source,
  };
}
