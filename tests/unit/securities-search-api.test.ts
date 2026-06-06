import { afterEach, describe, expect, it, vi } from "vitest";
import iconv from "iconv-lite";
import { NextRequest } from "next/server";
import { GET as searchSecurities } from "@/app/api/securities/search/route";

const previousEnv = {
  QUOTE_PROVIDER: process.env.QUOTE_PROVIDER,
};
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  restoreEnv("QUOTE_PROVIDER", previousEnv.QUOTE_PROVIDER);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("securities search API", () => {
  it("filters Japanese searches by market and avoids US-listed Japan ETFs", async () => {
    process.env.QUOTE_PROVIDER = "auto";
    const body = new Uint8Array(iconv.encode(
      'var suggestvalue="Amundi Index Solutions - Amundi JPX-Nikkei 400,41,jpny,jpny,Amundi Index Solutions - Amundi JPX-Nikkei 400,,Amundi Index Solutions - Amundi JPX-Nikkei 400,99,1,,,;iShares Currency Hedged JPX-Nikkei 400 ETF,41,hjpx,hjpx,iShares Currency Hedged JPX-Nikkei 400 ETF,,iShares Currency Hedged JPX-Nikkei 400 ETF,99,1,,,";',
      "gb18030",
    ));
    global.fetch = vi.fn(async () => new Response(body)) as typeof fetch;

    const response = await searchSecurities(
      new NextRequest("https://trade.local/api/securities/search?q=Nikkei%20Stock%20Average&market=JP"),
    );
    const payload = (await response.json()) as {
      data: Array<{ normalizedSymbol: string; market: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
      normalizedSymbol: "^N225",
      market: "JP",
    });
    expect(payload.data.every((item) => item.market === "JP")).toBe(true);
    expect(payload.data.map((item) => item.normalizedSymbol)).not.toContain("JPNY.US");
  });
});
