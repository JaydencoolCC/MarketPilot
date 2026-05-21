import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/news/route";
import { resetStoreForTests } from "@/lib/db/store";
import { getNewsProvider } from "@/lib/providers/news";

const previousEnv = {
  NEWS_PROVIDER: process.env.NEWS_PROVIDER,
};

beforeEach(() => {
  resetStoreForTests();
  process.env.NEWS_PROVIDER = "mock";
});

afterEach(() => {
  resetStoreForTests();
  restoreEnv("NEWS_PROVIDER", previousEnv.NEWS_PROVIDER);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("news API", () => {
  it("uses the public news provider by default", () => {
    delete process.env.NEWS_PROVIDER;

    expect(getNewsProvider().constructor.name).toBe("PublicNewsProvider");
  });

  it("returns recent news for requested symbols", async () => {
    const response = await GET(
      new NextRequest("https://trade.local/api/news?symbols=AAPL.US&hours=24"),
    );
    const payload = (await response.json()) as {
      data: Array<{ title: string; symbols: string[] }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
      title: "大型科技股财报预期继续支撑美股风险偏好",
      symbols: ["AAPL.US", "MSFT.US", "NVDA.US"],
    });
  });
});
