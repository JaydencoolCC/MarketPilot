import { getIntegrationSetting } from "@/lib/db/store";

export type ResolvedModelConfig = {
  source: "file" | "env" | "mock" | "unconfigured";
  provider: "mock" | "openai-compatible";
  baseUrl?: string;
  modelName?: string;
  apiKey?: string;
  message: string;
};

export async function resolveModelConfig(): Promise<ResolvedModelConfig> {
  const setting = await getIntegrationSetting("model");
  const hasFileConfig = Boolean(setting?.baseUrl && setting?.modelName && setting?.secret);

  if (hasFileConfig && setting?.secret) {
    return {
      source: "file",
      provider: "openai-compatible",
      baseUrl: setting.baseUrl,
      modelName: setting.modelName,
      apiKey: setting.secret,
      message: "使用设置页保存的模型配置。",
    };
  }

  if (process.env.MODEL_BASE_URL && process.env.MODEL_API_KEY && process.env.MODEL_NAME) {
    return {
      source: "env",
      provider: "openai-compatible",
      baseUrl: process.env.MODEL_BASE_URL,
      modelName: process.env.MODEL_NAME,
      apiKey: process.env.MODEL_API_KEY,
      message: "使用环境变量中的模型配置。",
    };
  }

  if ((process.env.MODEL_PROVIDER ?? "mock") === "mock") {
    return {
      source: "mock",
      provider: "mock",
      message: "使用 mock 模型 provider。",
    };
  }

  return {
    source: "unconfigured",
    provider: "openai-compatible",
    message: "模型 provider 尚未完成配置。",
  };
}

export function modelEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}
