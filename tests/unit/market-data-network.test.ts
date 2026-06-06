import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PUT } from "@/app/api/settings/market-data-network/route";
import {
  marketDataFetch,
  normalizeMarketDataProxyUrl,
  saveMarketDataNetworkSetting,
} from "@/lib/providers/market-data-network";
import { resetStoreForTests } from "@/lib/db/store";

const { undiciFetch } = vi.hoisted(() => ({
  undiciFetch: vi.fn(),
}));

vi.mock("undici", () => ({
  fetch: undiciFetch,
  ProxyAgent: class MockProxyAgent {
    constructor(public readonly uri: string) {}
  },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  undiciFetch.mockReset();
  resetStoreForTests();
});

describe("market data network settings", () => {
  it("normalizes proxy ports and rejects invalid protocols", () => {
    expect(normalizeMarketDataProxyUrl("7897")).toBe("http://127.0.0.1:7897");
    expect(normalizeMarketDataProxyUrl("http://127.0.0.1:7897")).toBe("http://127.0.0.1:7897");
    expect(() => normalizeMarketDataProxyUrl("socks5://127.0.0.1:7897")).toThrow("只支持 http 或 https");
  });

  it("saves and clears the local proxy setting through the API", async () => {
    const saveResponse = await PUT(jsonRequest("https://trade.local/api/settings/market-data-network", {
      proxyUrl: "7897",
    }));
    expect(saveResponse.status).toBe(200);

    const saved = (await saveResponse.json()) as { data: { proxyUrl?: string } };
    expect(saved.data.proxyUrl).toBe("http://127.0.0.1:7897");

    const readResponse = await GET();
    const read = (await readResponse.json()) as { data: { proxyUrl?: string } };
    expect(read.data.proxyUrl).toBe("http://127.0.0.1:7897");

    const clearResponse = await PUT(jsonRequest("https://trade.local/api/settings/market-data-network", {
      proxyUrl: "",
    }));
    const cleared = (await clearResponse.json()) as { data: { proxyUrl?: string } };
    expect(cleared.data.proxyUrl).toBeUndefined();
  });

  it("retries with proxy after a direct fetch failure", async () => {
    saveMarketDataNetworkSetting({ proxyUrl: "http://127.0.0.1:7897" });
    global.fetch = vi.fn(async () => new Response("forbidden", { status: 403 })) as typeof fetch;
    undiciFetch.mockResolvedValue(Response.json({ ok: true }));

    const response = await marketDataFetch("https://example.com/quote", { cache: "no-store" });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(undiciFetch).toHaveBeenCalledWith("https://example.com/quote", expect.objectContaining({
      dispatcher: expect.any(Object),
    }));
  });

  it("reports both direct and proxy failures", async () => {
    saveMarketDataNetworkSetting({ proxyUrl: "http://127.0.0.1:7897" });
    global.fetch = vi.fn(async () => {
      throw new Error("dns failed");
    }) as typeof fetch;
    undiciFetch.mockRejectedValue(new Error("proxy refused"));

    await expect(marketDataFetch("https://example.com/quote")).rejects.toThrow("直连失败：dns failed；代理失败：proxy refused");
  });

  it("tests the proxy with a Yahoo sample request", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("proxy test should not use direct fetch");
    }) as typeof fetch;
    undiciFetch.mockResolvedValue(Response.json({ chart: { result: [] } }));

    const response = await POST(jsonRequest("https://trade.local/api/settings/market-data-network", {
      proxyUrl: "7897",
    }));
    const payload = (await response.json()) as { result?: { message: string } };

    expect(response.status).toBe(200);
    expect(payload.result?.message).toContain("代理连接正常");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(undiciFetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      dispatcher: expect.any(Object),
    }));
  });
});

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
