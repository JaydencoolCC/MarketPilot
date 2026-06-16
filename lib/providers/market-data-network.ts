import { fetch as undiciFetch, ProxyAgent, type RequestInit as UndiciRequestInit } from "undici";
import { AppError } from "@/lib/domain/errors";
import { getLocalMarketDataNetworkSetting, saveLocalMarketDataNetworkSetting } from "@/lib/settings/local-settings";

const proxyAgents = new Map<string, ProxyAgent>();

type MarketDataFetchOptions = RequestInit & {
  retryWithProxy?: boolean;
  proxyOnly?: boolean;
};

export function normalizeMarketDataProxyUrl(input: string) {
  const value = input.trim();
  if (!value) return undefined;

  const urlText = /^\d+$/.test(value) ? `http://127.0.0.1:${value}` : value;
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new AppError("VALIDATION_ERROR", "请输入有效代理地址，例如 http://127.0.0.1:7897。", 400);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("VALIDATION_ERROR", "代理地址只支持 http 或 https。", 400);
  }

  return url.toString().replace(/\/$/, "");
}

export function getMarketDataNetworkSetting() {
  return getLocalMarketDataNetworkSetting();
}

export function saveMarketDataNetworkSetting(input: { proxyUrl?: string }) {
  const proxyUrl = normalizeMarketDataProxyUrl(input.proxyUrl ?? "");
  return saveLocalMarketDataNetworkSetting(proxyUrl ? { proxyUrl } : {});
}

export async function marketDataFetch(input: RequestInfo | URL, init?: MarketDataFetchOptions) {
  const retryWithProxy = init?.retryWithProxy ?? true;
  const proxyOnly = init?.proxyOnly ?? false;
  const directInit = withoutRetryOption(init);
  const proxyUrl = getMarketDataNetworkSetting().proxyUrl;

  if (proxyOnly) {
    if (!proxyUrl) {
      throw new AppError("VALIDATION_ERROR", "请先填写代理地址。", 400);
    }
    try {
      const response = await fetchWithProxy(input, directInit, proxyUrl);
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}`);
    } catch (proxyError) {
      throw new AppError("PROVIDER_UNAVAILABLE", `代理失败：${errorMessage(proxyError)}。`, 503);
    }
  }

  let directError: unknown;

  try {
    const response = await fetch(input, directInit);
    if (response.ok || !retryWithProxy) return response;
    directError = new Error(`HTTP ${response.status}`);
  } catch (error) {
    if (!retryWithProxy) throw error;
    directError = error;
  }

  if (!proxyUrl) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      `直连失败：${errorMessage(directError)}。可在“行情与新闻”设置代理地址后重试。`,
      503,
    );
  }

  try {
    const response = await fetchWithProxy(input, directInit, proxyUrl);
    if (response.ok) return response;
    throw new Error(`HTTP ${response.status}`);
  } catch (proxyError) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      `直连失败：${errorMessage(directError)}；代理失败：${errorMessage(proxyError)}。`,
      503,
    );
  }
}

function withoutRetryOption(init?: MarketDataFetchOptions): RequestInit | undefined {
  if (!init) return undefined;
  const fetchInit = { ...init };
  delete fetchInit.proxyOnly;
  delete fetchInit.retryWithProxy;
  return fetchInit;
}

async function fetchWithProxy(input: RequestInfo | URL, init: RequestInit | undefined, proxyUrl: string) {
  return undiciFetch(input instanceof Request ? input.url : input, {
    ...init,
    dispatcher: proxyAgent(proxyUrl),
  } as UndiciRequestInit);
}

function proxyAgent(proxyUrl: string) {
  const existing = proxyAgents.get(proxyUrl);
  if (existing) return existing;
  const agent = new ProxyAgent(proxyUrl);
  proxyAgents.set(proxyUrl, agent);
  return agent;
}

function errorMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) {
    const cause = error.cause as { code?: string; message?: string } | undefined;
    return cause?.code ?? cause?.message ?? error.message;
  }
  return "未知错误";
}
