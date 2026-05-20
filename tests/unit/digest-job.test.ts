import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWatchlistItem,
  resetStoreForTests,
  updateEmailSetting,
} from "@/lib/db/store";
import { isDailyDigestDue, runDailyDigestJob, sendDailyDigest } from "@/lib/jobs/digest";
import { assertJobRequestAuthorized } from "@/lib/utils/job-auth";

const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
  NEWS_PROVIDER: process.env.NEWS_PROVIDER,
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  APP_PASSWORD: process.env.APP_PASSWORD,
};

beforeEach(() => {
  resetStoreForTests();
  process.env.QUOTE_PROVIDER = "mock";
  process.env.NEWS_PROVIDER = "mock";
  process.env.MODEL_PROVIDER = "mock";
  process.env.EMAIL_PROVIDER = "mock";
});

afterEach(() => {
  resetStoreForTests();
  restoreEnv("QUOTE_PROVIDER", previousEnv.QUOTE_PROVIDER);
  restoreEnv("NEWS_PROVIDER", previousEnv.NEWS_PROVIDER);
  restoreEnv("MODEL_PROVIDER", previousEnv.MODEL_PROVIDER);
  restoreEnv("EMAIL_PROVIDER", previousEnv.EMAIL_PROVIDER);
  restoreEnv("APP_PASSWORD", previousEnv.APP_PASSWORD);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("daily digest job", () => {
  it("sends once per recipient and skips duplicate sends for the same digest date", async () => {
    await addWatchlistItem({ symbol: "AAPL.US" });
    await updateEmailSetting({
      enabled: true,
      recipientEmail: "me@example.com",
      sendTime: "08:30",
      timezone: "Asia/Shanghai",
      markets: ["US", "HK", "CN"],
      watchlistOnly: true,
    });

    const first = await sendDailyDigest();
    const second = await sendDailyDigest();

    expect(first).toMatchObject({
      status: "sent",
      message: "每日摘要已在 mock provider 中模拟发送。",
    });
    expect(second).toMatchObject({
      status: "skipped",
      message: "今天的每日摘要已经发送过，不会重复发送。",
    });
    expect(second.digest.title).toBe(first.digest.title);
  });

  it("requires the daily email setting to be enabled", async () => {
    await updateEmailSetting({
      enabled: false,
      recipientEmail: "me@example.com",
    });

    await expect(sendDailyDigest()).rejects.toThrow("每日邮件尚未启用");
  });

  it("skips the scheduled job before the configured send time", async () => {
    await updateEmailSetting({
      enabled: true,
      recipientEmail: "me@example.com",
      sendTime: "08:30",
      timezone: "Asia/Shanghai",
    });

    const result = await runDailyDigestJob(new Date("2026-05-19T00:00:00.000Z"));

    expect(result).toMatchObject({
      status: "skipped",
      message: "还没到今天的发送时间 08:30（Asia/Shanghai）。",
    });
    expect(result.jobRunId).toBeTruthy();
  });

  it("detects when a daily digest is due in the configured timezone", async () => {
    const setting = await updateEmailSetting({
      enabled: true,
      recipientEmail: "me@example.com",
      sendTime: "08:30",
      timezone: "Asia/Shanghai",
    });

    expect(isDailyDigestDue(setting, new Date("2026-05-19T00:29:00.000Z"))).toMatchObject({
      due: false,
    });
    expect(isDailyDigestDue(setting, new Date("2026-05-19T00:30:00.000Z"))).toMatchObject({
      due: true,
    });
  });

  it("protects job endpoints with APP_PASSWORD", () => {
    process.env.APP_PASSWORD = "job-secret";

    const request = new Request("https://trade.local/api/jobs/daily-digest", {
      method: "POST",
      headers: { authorization: "Bearer job-secret" },
    });
    expect(() => assertJobRequestAuthorized(request)).not.toThrow();

    const rejected = new Request("https://trade.local/api/jobs/daily-digest", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(() => assertJobRequestAuthorized(rejected)).toThrow("后台任务认证失败");
  });
});
