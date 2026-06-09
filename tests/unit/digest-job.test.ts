import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWatchlistItem,
  resetStoreForTests,
  updateEmailSetting,
  updateWatchlistHolding,
} from "@/lib/db/store";
import { buildDigestPreview, isDailyDigestDue, runDailyDigestJob, sendDailyDigest } from "@/lib/jobs/digest";
import { runDailyDigestSchedulerTick } from "@/lib/jobs/daily-digest-scheduler";

const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
  NEWS_PROVIDER: process.env.NEWS_PROVIDER,
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
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

  it("allows manual daily digest sends to retry after an earlier send", async () => {
    await addWatchlistItem({ symbol: "AAPL.US" });
    await updateEmailSetting({
      enabled: true,
      recipientEmail: "me@example.com",
      sendTime: "08:30",
      timezone: "Asia/Shanghai",
      markets: ["US", "HK", "CN"],
      watchlistOnly: true,
    });

    await sendDailyDigest();
    const retried = await sendDailyDigest({ force: true });

    expect(retried).toMatchObject({
      status: "sent",
      message: "每日摘要已在 mock provider 中模拟发送。",
    });
  });

  it("adds current holdings to the digest email content", async () => {
    const item = await addWatchlistItem({ symbol: "AAPL.US" });
    await updateWatchlistHolding(item.id, { costPrice: 200, shares: 2 });

    const { digest } = await buildDigestPreview();
    const holdings = digest.sections.find((section) => section.heading === "当前持仓");

    expect(holdings?.body).toContain("Apple（AAPL.US）");
    expect(holdings?.body).toContain("当前市值");
    expect(holdings?.body).toContain("浮动盈亏");
    expect(holdings?.body).toContain("+$53.68");
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

  it("runs the embedded scheduler tick without overlapping jobs", async () => {
    await updateEmailSetting({
      enabled: true,
      recipientEmail: "me@example.com",
      sendTime: "08:30",
      timezone: "Asia/Shanghai",
    });
    const state = { running: false };

    await runDailyDigestSchedulerTick(state);

    expect(state.running).toBe(false);
    const lockedState = { running: true };
    await runDailyDigestSchedulerTick(lockedState);
    expect(lockedState.running).toBe(true);
  });

});
