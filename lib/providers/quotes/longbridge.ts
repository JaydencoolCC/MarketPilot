import { createRequire } from "node:module";
import { AppError } from "@/lib/domain/errors";
import type { Market, Quote, Security } from "@/lib/domain/types";
import { normalizeSymbol, searchKnownSecurities, securityFromSymbol } from "@/lib/domain/symbols";
import type { QuoteProvider } from "@/lib/providers/quotes/types";

type LongbridgeModule = {
  Config?: {
    fromEnv?: () => unknown;
    from_env?: () => unknown;
  };
  QuoteContext?: new (config: unknown) => {
    quote?: (symbols: string[]) => Promise<unknown>;
  };
};

type LongbridgeQuoteRecord = {
  symbol?: string;
  last_done?: string | number;
  lastDone?: string | number;
  prev_close?: string | number;
  prevClose?: string | number;
  timestamp?: string | number;
  trade_status?: string | number;
  tradeStatus?: string | number;
};

export class LongbridgeQuoteProvider implements QuoteProvider {
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const normalizedSymbols = symbols.map((symbol) => normalizeSymbol(symbol));
    if (!normalizedSymbols.length) {
      return [];
    }

    const client = await createQuoteContext();
    if (!client.quote) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Longbridge QuoteContext 缺少 quote 方法，请检查 Node SDK 版本。",
        503,
      );
    }

    const response = await client.quote(normalizedSymbols);
    const records = normalizeQuoteResponse(response);
    const recordBySymbol = new Map(records.map((record) => [record.symbol, record]));

    return normalizedSymbols.map((symbol) => {
      const record = recordBySymbol.get(symbol);
      if (!record) {
        return errorQuote(symbol, "SYMBOL_NOT_RETURNED", "Longbridge 没有返回该标的行情。");
      }

      return quoteFromLongbridgeRecord(symbol, record);
    });
  }

  async searchSymbols(keyword: string, market?: Market): Promise<Security[]> {
    return searchKnownSecurities(keyword, market);
  }
}

async function createQuoteContext() {
  const sdk = await importLongbridgeSdk();
  const configFactory = sdk.Config?.fromEnv ?? sdk.Config?.from_env;
  if (!configFactory || !sdk.QuoteContext) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Longbridge Node SDK 初始化失败，请确认已安装 longbridge 并配置环境变量。",
      503,
    );
  }

  return new sdk.QuoteContext(configFactory());
}

async function importLongbridgeSdk(): Promise<LongbridgeModule> {
  const require = createRequire(import.meta.url);
  try {
    const packageName = ["long", "bridge"].join("");
    return require(packageName) as LongbridgeModule;
  } catch {
    try {
      const packageName = ["long", "port"].join("");
      return require(packageName) as LongbridgeModule;
    } catch {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "未安装 Longbridge Node SDK。请先运行 npm install longbridge，或继续使用 QUOTE_PROVIDER=mock。",
        503,
      );
    }
  }
}

function normalizeQuoteResponse(response: unknown): LongbridgeQuoteRecord[] {
  if (Array.isArray(response)) {
    return response as LongbridgeQuoteRecord[];
  }

  if (response && typeof response === "object") {
    const container = response as {
      secu_quote?: unknown;
      secuQuote?: unknown;
      data?: unknown;
    };

    if (Array.isArray(container.secu_quote)) {
      return container.secu_quote as LongbridgeQuoteRecord[];
    }
    if (Array.isArray(container.secuQuote)) {
      return container.secuQuote as LongbridgeQuoteRecord[];
    }
    if (Array.isArray(container.data)) {
      return container.data as LongbridgeQuoteRecord[];
    }
  }

  throw new AppError("PROVIDER_UNAVAILABLE", "Longbridge 行情响应格式无法识别。", 503);
}

function quoteFromLongbridgeRecord(symbol: string, record: LongbridgeQuoteRecord): Quote {
  const security = securityFromSymbol(symbol);
  const price = toNumber(record.last_done ?? record.lastDone);
  const previousClose = toNumber(record.prev_close ?? record.prevClose);
  const change = Number((price - previousClose).toFixed(6));
  const changePercent = previousClose
    ? Number(((change / previousClose) * 100).toFixed(6))
    : 0;
  const timestamp = toTimestamp(record.timestamp);

  return {
    symbol,
    price,
    change,
    changePercent,
    currency: security.currency,
    marketStatus: toMarketStatus(record.trade_status ?? record.tradeStatus),
    provider: "longbridge",
    quoteTime: timestamp.toISOString(),
    status: "ok",
  };
}

function errorQuote(symbol: string, errorCode: string, errorMessage: string): Quote {
  const security = securityFromSymbol(symbol);
  return {
    symbol: security.normalizedSymbol,
    price: 0,
    change: 0,
    changePercent: 0,
    currency: security.currency,
    marketStatus: "closed",
    provider: "longbridge",
    quoteTime: new Date().toISOString(),
    status: "error",
    errorCode,
    errorMessage,
  };
}

function toNumber(value: string | number | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return number;
}

function toTimestamp(value: string | number | undefined) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return new Date();
  }
  return new Date(timestamp * 1000);
}

function toMarketStatus(value: string | number | undefined): Quote["marketStatus"] {
  return Number(value) === 0 ? "open" : "closed";
}
