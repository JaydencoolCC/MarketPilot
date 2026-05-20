import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addWatchlistItem, resetStoreForTests } from "@/lib/db/store";
import { runRefreshQuotesJob } from "@/lib/jobs/quotes";

const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
  NEWS_PROVIDER: process.env.NEWS_PROVIDER,
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
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("refresh quotes job", () => {
  it("skips cleanly when the watchlist is empty", async () => {
    await expect(runRefreshQuotesJob()).resolves.toMatchObject({
      status: "success",
      message: "没有自选股，跳过行情刷新。",
      refreshedCount: 0,
    });
  });

  it("refreshes quotes for current watchlist items", async () => {
    await addWatchlistItem({ symbol: "AAPL.US" });
    await addWatchlistItem({ symbol: "700.HK" });

    await expect(runRefreshQuotesJob()).resolves.toMatchObject({
      status: "success",
      message: "已刷新 2 条行情快照。",
      refreshedCount: 2,
    });
  });
});
