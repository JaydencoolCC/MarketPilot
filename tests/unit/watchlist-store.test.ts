import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWatchlistItem,
  deleteWatchlistItem,
  getEmailSetting,
  getWatchlistItems,
  listPublicIntegrations,
  listWatchlistRows,
  resetStoreForTests,
  updateWatchlistHolding,
  upsertEmailIntegration,
  updateEmailSetting,
} from "@/lib/db/store";
import { calculateStockHolding } from "@/lib/domain/holdings";

const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
  NEWS_PROVIDER: process.env.NEWS_PROVIDER,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  SMTP_URL: process.env.SMTP_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  MODEL_BASE_URL: process.env.MODEL_BASE_URL,
  MODEL_API_KEY: process.env.MODEL_API_KEY,
  MODEL_NAME: process.env.MODEL_NAME,
};

beforeEach(() => {
  resetStoreForTests();
  process.env.QUOTE_PROVIDER = "mock";
  process.env.NEWS_PROVIDER = "mock";
});

afterEach(() => {
  resetStoreForTests();
  restoreEnv("QUOTE_PROVIDER", previousEnv.QUOTE_PROVIDER);
  restoreEnv("NEWS_PROVIDER", previousEnv.NEWS_PROVIDER);
  restoreEnv("EMAIL_PROVIDER", previousEnv.EMAIL_PROVIDER);
  restoreEnv("SMTP_URL", previousEnv.SMTP_URL);
  restoreEnv("EMAIL_FROM", previousEnv.EMAIL_FROM);
  restoreEnv("MODEL_PROVIDER", previousEnv.MODEL_PROVIDER);
  restoreEnv("MODEL_BASE_URL", previousEnv.MODEL_BASE_URL);
  restoreEnv("MODEL_API_KEY", previousEnv.MODEL_API_KEY);
  restoreEnv("MODEL_NAME", previousEnv.MODEL_NAME);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("watchlist store", () => {
  it("adds normalized US, HK, and CN symbols with quote snapshots", async () => {
    await addWatchlistItem({ symbol: "aapl" });
    await addWatchlistItem({ symbol: "00700", market: "HK" });
    await addWatchlistItem({ symbol: "600519" });

    const rows = await listWatchlistRows();
    expect(rows.map((row) => row.normalizedSymbol)).toEqual([
      "600519.SH",
      "700.HK",
      "AAPL.US",
    ]);
    expect(rows.every((row) => row.quote?.status === "ok")).toBe(true);
  });

  it("deduplicates and deletes watchlist items", async () => {
    const first = await addWatchlistItem({ symbol: "AAPL.US" });
    const second = await addWatchlistItem({ symbol: "aapl" });

    expect(second.id).toBe(first.id);
    expect(await getWatchlistItems()).toHaveLength(1);

    await deleteWatchlistItem(first.id);
    expect(await getWatchlistItems()).toHaveLength(0);
  });

  it("uses company names for known HK and A-share symbols", async () => {
    await addWatchlistItem({ symbol: "000001.SH" });
    await addWatchlistItem({ symbol: "1810.HK" });
    await addWatchlistItem({ symbol: "000725.SZ" });
    await addWatchlistItem({ symbol: "000876.SZ" });
    await addWatchlistItem({ symbol: "002352.SZ" });

    expect((await getWatchlistItems()).map((item) => item.name)).toEqual([
      "顺丰控股",
      "新希望",
      "京东方A",
      "小米集团-W",
      "上证指数",
    ]);
  });

  it("keeps watchlist usable when the quote provider fails", async () => {
    process.env.QUOTE_PROVIDER = "unavailable";

    await addWatchlistItem({ symbol: "AAPL.US" });
    const [row] = await listWatchlistRows();

    expect(row?.normalizedSymbol).toBe("AAPL.US");
    expect(row?.dataStatus).toBe("error");
    expect(row?.quote?.errorMessage).toContain("行情暂时不可用");
  });

  it("stores, updates, and clears stock holding inputs", async () => {
    const item = await addWatchlistItem({ symbol: "AAPL.US" });

    await updateWatchlistHolding(item.id, { costPrice: 200.25, shares: 1.5 });
    let [row] = await listWatchlistRows();

    expect(row).toMatchObject({
      costPrice: 200.25,
      shares: 1.5,
    });

    await updateWatchlistHolding(item.id, { costPrice: 210, shares: 2.25 });
    [row] = await listWatchlistRows();
    expect(row).toMatchObject({
      costPrice: 210,
      shares: 2.25,
    });

    await updateWatchlistHolding(item.id, { costPrice: null, shares: null });
    [row] = await listWatchlistRows();
    expect(row.costPrice).toBeUndefined();
    expect(row.shares).toBeUndefined();
  });

  it("calculates stock holding metrics from mock quotes", async () => {
    const profitable = await addWatchlistItem({ symbol: "AAPL.US" });
    const losing = await addWatchlistItem({ symbol: "MSFT.US" });

    await updateWatchlistHolding(profitable.id, { costPrice: 200, shares: 2 });
    await updateWatchlistHolding(losing.id, { costPrice: 520, shares: 1.5 });
    const rows = await listWatchlistRows();

    const apple = rows.find((row) => row.normalizedSymbol === "AAPL.US");
    const microsoft = rows.find((row) => row.normalizedSymbol === "MSFT.US");
    const appleMetrics = apple ? calculateStockHolding(apple) : null;
    const microsoftMetrics = microsoft ? calculateStockHolding(microsoft) : null;

    expect(appleMetrics).toMatchObject({
      costValue: 400,
      marketValue: 453.68,
      todayPnl: 4.62,
      unrealizedPnl: 53.68000000000001,
    });
    expect(appleMetrics?.unrealizedPnlPercent).toBeCloseTo(13.42);
    expect(microsoftMetrics?.costValue).toBe(780);
    expect(microsoftMetrics?.marketValue).toBeCloseTo(768.3);
    expect(microsoftMetrics?.todayPnl).toBeCloseTo(-2.16);
    expect(microsoftMetrics?.unrealizedPnl).toBeCloseTo(-11.7);
    expect(microsoftMetrics?.unrealizedPnlPercent).toBeCloseTo(-1.5);
  });

  it("does not calculate holdings without both inputs and a quote", async () => {
    const item = await addWatchlistItem({ symbol: "AAPL.US" });
    const [row] = await listWatchlistRows();

    expect(calculateStockHolding(row)).toBeNull();

    await updateWatchlistHolding(item.id, { costPrice: 200, shares: 2 });
    const [heldRow] = await listWatchlistRows();
    expect(calculateStockHolding({ ...heldRow, quote: null })).toBeNull();
  });

  it("rejects invalid stock holding inputs", async () => {
    const item = await addWatchlistItem({ symbol: "AAPL.US" });

    await expect(
      updateWatchlistHolding(item.id, { costPrice: 0, shares: 1 }),
    ).rejects.toThrow("成本价和股票数必须大于 0");
    await expect(
      updateWatchlistHolding(item.id, { costPrice: -1, shares: 1 }),
    ).rejects.toThrow("成本价和股票数必须大于 0");
    await expect(
      updateWatchlistHolding(item.id, { costPrice: 1, shares: 0 }),
    ).rejects.toThrow("成本价和股票数必须大于 0");
    await expect(updateWatchlistHolding(item.id, { costPrice: 1 })).rejects.toThrow(
      "请同时填写成本价和股票数",
    );
  });

  it("updates email digest settings in the fallback store", async () => {
    const updated = await updateEmailSetting({
      enabled: true,
      recipientEmail: "me@example.com",
      sendTime: "09:15",
      timezone: "Asia/Shanghai",
      markets: ["US", "HK"],
      watchlistOnly: true,
    });

    expect(updated).toMatchObject({
      enabled: true,
      recipientEmail: "me@example.com",
      sendTime: "09:15",
      markets: ["US", "HK"],
      watchlistOnly: true,
    });
    await expect(getEmailSetting()).resolves.toMatchObject({
      recipientEmail: "me@example.com",
      sendTime: "09:15",
    });
  });

  it("shows an actionable email integration status when SMTP is incomplete", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    delete process.env.SMTP_URL;

    const email = (await listPublicIntegrations()).find((item) => item.kind === "email");

    expect(email).toMatchObject({
      provider: "smtp",
      source: "unconfigured",
      status: "failed",
      statusMessage: "SMTP 配置不完整，请设置 SMTP_URL 和 EMAIL_FROM。",
    });
  });

  it("does not report mock chat as a completed real model integration", async () => {
    process.env.MODEL_PROVIDER = "mock";
    delete process.env.MODEL_BASE_URL;
    delete process.env.MODEL_API_KEY;
    delete process.env.MODEL_NAME;

    const model = (await listPublicIntegrations()).find((item) => item.kind === "model");

    expect(model).toMatchObject({
      provider: "mock",
      source: "mock",
      status: "failed",
      statusMessage: "真实模型未配置，请填写 Base URL、模型名称和 API Key。",
    });
  });

  it("stores SMTP settings from the settings page", async () => {
    await upsertEmailIntegration({
      smtpUrl: "smtps://user:auth-code@smtp.qq.com:465",
      from: "user@qq.com",
    });

    const email = (await listPublicIntegrations()).find((item) => item.kind === "email");

    expect(email).toMatchObject({
      provider: "smtp",
      source: "file",
      baseUrl: "user@qq.com",
      secretConfigured: true,
    });
    expect(email?.secretPreview).not.toContain("auth-code");
  });
});
