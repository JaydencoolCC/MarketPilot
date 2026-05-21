import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getIntegrationSetting,
  resetStoreForTests,
  upsertModelIntegration,
} from "@/lib/db/store";
import { resolveModelConfig } from "@/lib/providers/model/config";

const previousEnv = {
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  MODEL_BASE_URL: process.env.MODEL_BASE_URL,
  MODEL_API_KEY: process.env.MODEL_API_KEY,
  MODEL_NAME: process.env.MODEL_NAME,
  SETTINGS_ENCRYPTION_KEY: process.env.SETTINGS_ENCRYPTION_KEY,
};

beforeEach(() => {
  resetStoreForTests();
  process.env.MODEL_PROVIDER = "mock";
  delete process.env.MODEL_BASE_URL;
  delete process.env.MODEL_API_KEY;
  delete process.env.MODEL_NAME;
  process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key";
});

afterEach(() => {
  resetStoreForTests();
  restoreEnv("MODEL_PROVIDER", previousEnv.MODEL_PROVIDER);
  restoreEnv("MODEL_BASE_URL", previousEnv.MODEL_BASE_URL);
  restoreEnv("MODEL_API_KEY", previousEnv.MODEL_API_KEY);
  restoreEnv("MODEL_NAME", previousEnv.MODEL_NAME);
  restoreEnv("SETTINGS_ENCRYPTION_KEY", previousEnv.SETTINGS_ENCRYPTION_KEY);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("model configuration resolution", () => {
  it("prefers local file settings over environment variables", async () => {
    process.env.MODEL_BASE_URL = "https://env.example.com/v1";
    process.env.MODEL_API_KEY = "env-secret";
    process.env.MODEL_NAME = "env-model";

    await upsertModelIntegration({
      baseUrl: "https://db.example.com/v1",
      modelName: "db-model",
      apiKey: "db-secret",
    });

    const stored = await getIntegrationSetting("model");
    expect(stored?.secret).toBe("db-secret");
    expect(stored?.lastTestStatus).toBe("untested");
    expect(stored?.lastTestMessage).toBe("已保存 API Key，尚未测试模型连接。");

    const resolved = await resolveModelConfig();
    expect(resolved).toMatchObject({
      source: "file",
      baseUrl: "https://db.example.com/v1",
      modelName: "db-model",
      apiKey: "db-secret",
    });
  });

  it("falls back to environment variables when no complete local file config exists", async () => {
    process.env.MODEL_BASE_URL = "https://env.example.com/v1";
    process.env.MODEL_API_KEY = "env-secret";
    process.env.MODEL_NAME = "env-model";

    const resolved = await resolveModelConfig();
    expect(resolved).toMatchObject({
      source: "env",
      baseUrl: "https://env.example.com/v1",
      modelName: "env-model",
      apiKey: "env-secret",
    });
  });

  it("uses mock provider when neither local file nor environment config is complete", async () => {
    const resolved = await resolveModelConfig();
    expect(resolved).toMatchObject({
      source: "mock",
      provider: "mock",
    });
  });
});
