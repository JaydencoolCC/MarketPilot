import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE as deleteFund } from "@/app/api/funds/[id]/route";
import { GET as getFundHoldings } from "@/app/api/funds/holdings/route";
import { GET as listFunds, POST as addFund } from "@/app/api/funds/route";
import { POST as refreshFundsJob } from "@/app/api/jobs/refresh-funds/route";
import { resetStoreForTests } from "@/lib/db/store";

const originalFetch = global.fetch;
const previousEnv = {
  FUND_PROVIDER: process.env.FUND_PROVIDER,
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
};

beforeEach(() => {
  resetStoreForTests();
  process.env.FUND_PROVIDER = "public";
  process.env.QUOTE_PROVIDER = "mock";
  global.fetch = vi.fn(async () =>
    new Response(
      'jsonpgz({"fundcode":"110022","name":"易方达消费行业股票","jzrq":"2026-05-22","dwjz":"4.1234","gsz":"4.1567","gszzl":"1.23","gztime":"2026-05-22 15:00"});',
    ),
  ) as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  resetStoreForTests();
  restoreEnv("FUND_PROVIDER", previousEnv.FUND_PROVIDER);
  restoreEnv("QUOTE_PROVIDER", previousEnv.QUOTE_PROVIDER);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("fund APIs", () => {
  it("adds and lists a mutual fund", async () => {
    const addResponse = await addFund(jsonRequest("https://trade.local/api/funds", { symbol: "110022" }));
    expect(addResponse.status).toBe(201);

    const listResponse = await listFunds();
    const payload = (await listResponse.json()) as { data: Array<{ normalizedSymbol: string; dataStatus: string }> };

    expect(payload.data).toEqual([
      expect.objectContaining({ normalizedSymbol: "110022.FUND", dataStatus: "ok" }),
    ]);
  });

  it("deletes a fund", async () => {
    const addResponse = await addFund(jsonRequest("https://trade.local/api/funds", { symbol: "110022" }));
    const addPayload = (await addResponse.json()) as { data: { id: string } };

    const deleteResponse = await deleteFund(
      new Request(`https://trade.local/api/funds/${addPayload.data.id}`),
      { params: Promise.resolve({ id: addPayload.data.id }) },
    );
    const deletePayload = (await deleteResponse.json()) as { data: unknown[] };

    expect(deletePayload.data).toHaveLength(0);
  });

  it("skips the refresh funds job when there are no funds", async () => {
    const response = await refreshFundsJob(new NextRequest("https://trade.local/api/jobs/refresh-funds", {
      method: "POST",
    }));
    const payload = (await response.json()) as { data: { status: string; refreshed: number } };

    expect(payload.data).toMatchObject({ status: "skipped", refreshed: 0 });
  });

  it("returns fund holdings", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        `var apidata={ content:"截止至：<font class='px12'>2026-03-31</font><table><tbody><tr><td>1</td><td><a>600519</a></td><td class='tol'><a>贵州茅台</a></td><td></td><td></td><td></td><td class='tor'>9.90%</td><td class='tor'>86.66</td><td class='tor'>125,656.71</td></tr></tbody></table>",arryear:[]};`,
      ),
    ) as typeof fetch;

    const response = await getFundHoldings(new NextRequest("https://trade.local/api/funds/holdings?symbol=110022"));
    const payload = (await response.json()) as { data: Array<{ name: string; weightPercent: number }> };

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([expect.objectContaining({ name: "贵州茅台", weightPercent: 9.9 })]);
  });
});

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
