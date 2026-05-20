import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWatchlistItem,
  deleteWatchlistItem,
  getEmailSetting,
  getWatchlistItems,
  listWatchlistRows,
  resetStoreForTests,
  updateEmailSetting,
} from "@/lib/db/store";

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

  it("keeps watchlist usable when the quote provider fails", async () => {
    process.env.QUOTE_PROVIDER = "unavailable";

    await addWatchlistItem({ symbol: "AAPL.US" });
    const [row] = await listWatchlistRows();

    expect(row?.normalizedSymbol).toBe("AAPL.US");
    expect(row?.dataStatus).toBe("error");
    expect(row?.quote?.errorMessage).toContain("行情暂时不可用");
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
});
