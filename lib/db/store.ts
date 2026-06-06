import type {
  EmailDigestSetting,
  FundItem,
  FundRow,
  FundSearchResult,
  FundSnapshot,
  IntegrationKind,
  IntegrationSetting,
  Market,
  PublicIntegrationSetting,
  Quote,
  WatchlistItem,
  WatchlistRow,
} from "@/lib/domain/types";
import { AppError } from "@/lib/domain/errors";
import { fundFromSymbol } from "@/lib/domain/funds";
import { securityFromSymbol } from "@/lib/domain/symbols";
import {
  getPrisma,
  shouldUseDatabase,
  type FundSnapshotRecord,
  type FundWatchlistRecord,
  type QuoteSnapshotRecord,
  type WatchlistRecord,
} from "@/lib/db/prisma";
import { getFundProvider } from "@/lib/providers/funds";
import { getNewsProvider } from "@/lib/providers/news";
import { getQuoteProvider } from "@/lib/providers/quotes";
import {
  getLocalEmailSetting,
  getLocalIntegrationSetting,
  resetLocalSettingsForTests,
  saveLocalEmailSetting,
  saveLocalIntegrationSetting,
} from "@/lib/settings/local-settings";
import { resetLocalDigestStateForTests } from "@/lib/settings/local-digest-state";
import { maskSecret } from "@/lib/utils/secrets";

type StoreState = {
  watchlist: WatchlistItem[];
  quotes: Record<string, Quote>;
  funds: FundItem[];
  fundSnapshots: Record<string, FundSnapshot>;
  emailSetting: EmailDigestSetting;
  integrations: Partial<Record<IntegrationKind, IntegrationSetting>>;
};

const globalStore = globalThis as typeof globalThis & {
  tradeStore?: StoreState;
};

function now() {
  return new Date().toISOString();
}

function createInitialStore(): StoreState {
  const timestamp = now();
  return {
    watchlist: [],
    quotes: {},
    funds: [],
    fundSnapshots: {},
    emailSetting: {
      id: "default-email-setting",
      enabled: false,
      recipientEmail: "",
      sendTime: "08:30",
      timezone: process.env.APP_TIMEZONE || "Asia/Shanghai",
      markets: ["US", "HK", "CN", "JP"],
      watchlistOnly: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    integrations: {},
  };
}

function getStore() {
  globalStore.tradeStore ??= createInitialStore();
  globalStore.tradeStore.integrations ??= {};
  return globalStore.tradeStore;
}

function watchlistItemFromRecord(record: WatchlistRecord): WatchlistItem {
  const security = securityFromSymbol(record.normalizedSymbol);
  const name = shouldReplaceWatchlistName(record.name, record.normalizedSymbol, record.symbol)
    ? security.name
    : record.name;

  return {
    id: record.id,
    symbol: security.symbol,
    normalizedSymbol: security.normalizedSymbol,
    market: security.market,
    name,
    currency: security.currency,
    costPrice: record.costPrice === null ? undefined : Number(record.costPrice),
    shares: record.shares === null ? undefined : Number(record.shares),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function resolveSecurityForWatchlist(input: { symbol: string; market?: Market }) {
  const fallback = securityFromSymbol(input.symbol, input.market);
  const searchTerms = [...new Set([fallback.normalizedSymbol, fallback.symbol])];

  try {
    const resultGroups = await Promise.all(
      searchTerms.map((term) => getQuoteProvider().searchSymbols(term, fallback.market)),
    );
    const results = resultGroups.flat();
    return results.find((item) => item.normalizedSymbol === fallback.normalizedSymbol) ?? fallback;
  } catch {
    return fallback;
  }
}

function shouldReplaceWatchlistName(name: string | undefined, normalizedSymbol: string, symbol: string) {
  if (!name || name === normalizedSymbol || name === symbol) return true;
  try {
    return securityFromSymbol(name).normalizedSymbol === normalizedSymbol;
  } catch {
    return false;
  }
}

function quoteFromSnapshot(snapshot: QuoteSnapshotRecord): Quote {
  return {
    symbol: snapshot.symbol,
    price: Number(snapshot.price),
    change: Number(snapshot.change),
    changePercent: Number(snapshot.changePercent),
    currency: snapshot.currency,
    marketStatus: snapshot.marketStatus as Quote["marketStatus"],
    provider: snapshot.provider,
    quoteTime: snapshot.quoteTime.toISOString(),
    fetchedAt: (snapshot.updatedAt ?? snapshot.createdAt)?.toISOString(),
    status: snapshot.errorCode ? "error" : "ok",
    errorCode: snapshot.errorCode ?? undefined,
    errorMessage: snapshot.errorMessage ?? undefined,
  };
}

function displayQuoteAfterFailure(quote: Quote): Quote {
  if (quote.status !== "error" || quote.price <= 0) return quote;
  return {
    ...quote,
    status: "stale",
    errorCode: undefined,
    errorMessage: undefined,
  };
}

function quotesToPersist(quotes: Quote[]) {
  return quotes.filter((quote) => quote.status === "ok" || (quote.status === "error" && quote.price <= 0));
}

function hasFailedQuotes(quotes: Quote[]) {
  return quotes.some((quote) => quote.status === "error");
}

function replaceFailedQuotesWithLatest(quotes: Quote[], latestQuotes: Record<string, Quote>) {
  return quotes.map((quote) => {
    if (quote.status !== "error") return quote;
    const security = securityFromSymbol(quote.symbol);
    const latest = latestQuotes[security.normalizedSymbol] ?? latestQuotes[quote.symbol];
    if (!latest) return quote;
    return {
      ...latest,
      status: "stale",
      fetchedAt: quote.fetchedAt ?? latest.fetchedAt,
    } satisfies Quote;
  });
}

function fundItemFromRecord(record: FundWatchlistRecord): FundItem {
  return {
    id: record.id,
    code: record.code,
    normalizedSymbol: record.normalizedSymbol,
    type: record.type as FundItem["type"],
    market: record.market ?? undefined,
    name: record.name,
    currency: record.currency,
    costPrice: record.costPrice === null ? undefined : Number(record.costPrice),
    shares: record.shares === null ? undefined : Number(record.shares),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function fundSnapshotFromRecord(snapshot: FundSnapshotRecord): FundSnapshot {
  return {
    symbol: snapshot.symbol,
    netValue: Number(snapshot.netValue),
    estimateValue: snapshot.estimateValue === null ? undefined : Number(snapshot.estimateValue),
    changePercent: Number(snapshot.changePercent),
    currency: snapshot.currency,
    provider: snapshot.provider,
    quoteTime: snapshot.quoteTime.toISOString(),
    fetchedAt: snapshot.createdAt?.toISOString(),
    status: snapshot.errorCode ? "error" : "ok",
    errorCode: snapshot.errorCode ?? undefined,
    errorMessage: snapshot.errorMessage ?? undefined,
  };
}

export async function listWatchlistRows(): Promise<WatchlistRow[]> {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const records = (await db.watchlistItem.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        quoteSnapshots: {
          orderBy: [{ quoteTime: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    })) as Array<WatchlistRecord & { quoteSnapshots: QuoteSnapshotRecord[] }>;
    const symbols = records.map((item) => item.normalizedSymbol);
    const articles = await fetchRecentNewsSafely(symbols);
    const newsCountBySymbol = new Map<string, number>();

    for (const article of articles) {
      for (const symbol of article.symbols) {
        newsCountBySymbol.set(symbol, (newsCountBySymbol.get(symbol) ?? 0) + 1);
      }
    }

    return records.map((record) => {
      const quote = record.quoteSnapshots[0]
        ? displayQuoteAfterFailure(quoteFromSnapshot(record.quoteSnapshots[0]))
        : null;
      return {
        ...watchlistItemFromRecord(record),
        quote,
        todayNewsCount: newsCountBySymbol.get(record.normalizedSymbol) ?? 0,
        dataStatus: quote?.status ?? "stale",
      };
    });
  }

  const store = getStore();
  const symbols = store.watchlist.map((item) => item.normalizedSymbol);
  const articles = await fetchRecentNewsSafely(symbols);
  const newsCountBySymbol = new Map<string, number>();

  for (const article of articles) {
    for (const symbol of article.symbols) {
      newsCountBySymbol.set(symbol, (newsCountBySymbol.get(symbol) ?? 0) + 1);
    }
  }

  return store.watchlist.map((item) => {
    const quote = store.quotes[item.normalizedSymbol] ? displayQuoteAfterFailure(store.quotes[item.normalizedSymbol]) : null;
    return {
      ...item,
      quote,
      todayNewsCount: newsCountBySymbol.get(item.normalizedSymbol) ?? 0,
      dataStatus: quote?.status ?? "stale",
    };
  });
}

async function fetchRecentNewsSafely(symbols: string[]) {
  try {
    return await getNewsProvider().fetchMarketNews({ symbols, hours: 24 });
  } catch {
    return [];
  }
}

export async function addWatchlistItem(input: { symbol: string; market?: Market }) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const security = await resolveSecurityForWatchlist(input);
    const existing = await db.watchlistItem.findUnique({
      where: { normalizedSymbol: security.normalizedSymbol },
    });

    if (existing) {
      if (shouldReplaceWatchlistName(existing.name, existing.normalizedSymbol, existing.symbol)) {
        const updated = await db.watchlistItem.update({
          where: { id: existing.id },
          data: { name: security.name },
        });
        return watchlistItemFromRecord(updated);
      }
      return watchlistItemFromRecord(existing);
    }

    const created = await db.watchlistItem.create({
      data: {
        symbol: security.symbol,
        normalizedSymbol: security.normalizedSymbol,
        market: security.market,
        name: security.name,
        currency: security.currency,
      },
    });
    await refreshQuotes([created.normalizedSymbol]);
    return watchlistItemFromRecord(created);
  }

  const store = getStore();
  const security = await resolveSecurityForWatchlist(input);
  const exists = store.watchlist.find(
    (item) => item.normalizedSymbol === security.normalizedSymbol,
  );

  if (exists) {
    if (shouldReplaceWatchlistName(exists.name, exists.normalizedSymbol, exists.symbol)) {
      exists.name = security.name;
      exists.updatedAt = now();
    }
    return exists;
  }

  const timestamp = now();
  const item: WatchlistItem = {
    id: crypto.randomUUID(),
    symbol: security.symbol,
    normalizedSymbol: security.normalizedSymbol,
    market: security.market,
    name: security.name,
    currency: security.currency,
    costPrice: undefined,
    shares: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.watchlist.unshift(item);
  await refreshQuotes([item.normalizedSymbol]);
  return item;
}

export async function updateWatchlistHolding(
  id: string,
  input: { costPrice?: number | null; shares?: number | null },
) {
  const clearing = input.costPrice === null && input.shares === null;
  const costPrice = input.costPrice;
  const shares = input.shares;
  const holding =
    typeof costPrice === "number" && typeof shares === "number" ? { costPrice, shares } : null;

  if (!clearing && !holding) {
    throw new AppError("VALIDATION_ERROR", "请同时填写成本价和股票数。", 400);
  }

  if (holding && (holding.costPrice <= 0 || holding.shares <= 0)) {
    throw new AppError("VALIDATION_ERROR", "成本价和股票数必须大于 0。", 400);
  }

  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const item = await db.watchlistItem.findUnique({ where: { id } });
    if (!item) {
      throw new AppError("NOT_FOUND", "没有找到这只自选股。", 404);
    }

    const updated = await db.watchlistItem.update({
      where: { id },
      data: clearing
        ? { costPrice: null, shares: null }
        : { costPrice: holding!.costPrice.toString(), shares: holding!.shares.toString() },
    });
    return watchlistItemFromRecord(updated);
  }

  const store = getStore();
  const item = store.watchlist.find((entry) => entry.id === id);
  if (!item) {
    throw new AppError("NOT_FOUND", "没有找到这只自选股。", 404);
  }

  item.costPrice = clearing ? undefined : holding!.costPrice;
  item.shares = clearing ? undefined : holding!.shares;
  item.updatedAt = now();
  return item;
}

export async function deleteWatchlistItem(id: string) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const item = await db.watchlistItem.findUnique({ where: { id } });
    if (!item) {
      throw new AppError("NOT_FOUND", "没有找到这只自选股。", 404);
    }

    await db.watchlistItem.delete({ where: { id } });
    return;
  }

  const store = getStore();
  const item = store.watchlist.find((entry) => entry.id === id);
  if (!item) {
    throw new AppError("NOT_FOUND", "没有找到这只自选股。", 404);
  }

  store.watchlist = store.watchlist.filter((entry) => entry.id !== id);
  delete store.quotes[item.normalizedSymbol];
}

export async function refreshQuotes(symbols?: string[]) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const targetSymbols =
      symbols ??
      (
        await db.watchlistItem.findMany({
          select: { normalizedSymbol: true },
          orderBy: { createdAt: "desc" },
        })
      ).map((item) => item.normalizedSymbol);

    if (!targetSymbols.length) {
      return [];
    }

    const provider = getQuoteProvider();
    let quotes: Quote[];
    try {
      quotes = await provider.getQuotes(targetSymbols);
      if (hasFailedQuotes(quotes)) {
        const latestQuotes = await latestQuotesFromDatabase(db, targetSymbols);
        quotes = replaceFailedQuotesWithLatest(quotes, latestQuotes);
      }
    } catch (error) {
      const latestQuotes = await latestQuotesFromDatabase(db, targetSymbols);
      quotes = buildProviderFailureQuotes(targetSymbols, latestQuotes, error).map(displayQuoteAfterFailure);
    }

    const watchlistItems = (await db.watchlistItem.findMany({
      where: { normalizedSymbol: { in: targetSymbols } },
      select: { id: true, normalizedSymbol: true },
    })) as Array<{ id: string; normalizedSymbol: string }>;
    const itemBySymbol = new Map(
      watchlistItems.flatMap((item) => {
        const canonicalSymbol = securityFromSymbol(item.normalizedSymbol).normalizedSymbol;
        return [
          [item.normalizedSymbol, item.id],
          [canonicalSymbol, item.id],
        ] as Array<[string, string]>;
      }),
    );
    const snapshotIdBySymbol = await latestQuoteSnapshotIdsFromDatabase(db, targetSymbols);

    await db.$transaction(
      quotesToPersist(quotes).flatMap((quote) => {
        const watchlistItemId = itemBySymbol.get(quote.symbol);
        if (!watchlistItemId) {
          return [];
        }

        const data = {
          watchlistItemId,
          symbol: quote.symbol,
          price: quote.price.toString(),
          change: quote.change.toString(),
          changePercent: quote.changePercent.toString(),
          currency: quote.currency,
          marketStatus: quote.marketStatus,
          provider: quote.provider,
          quoteTime: new Date(quote.quoteTime),
          errorCode: quote.errorCode,
          errorMessage: quote.errorMessage,
        };
        const snapshotId = snapshotIdBySymbol.get(quote.symbol);

        return snapshotId
          ? db.quoteSnapshot.update({
              where: { id: snapshotId },
              data,
            })
          : db.quoteSnapshot.create({
              data,
            });
      }),
    );

    return quotes;
  }

  const store = getStore();
  const targetSymbols = symbols ?? store.watchlist.map((item) => item.normalizedSymbol);
  if (!targetSymbols.length) {
    return [];
  }

  const provider = getQuoteProvider();
  let quotes: Quote[];
  try {
    quotes = await provider.getQuotes(targetSymbols);
    if (hasFailedQuotes(quotes)) {
      quotes = replaceFailedQuotesWithLatest(quotes, store.quotes);
    }
  } catch (error) {
    quotes = buildProviderFailureQuotes(targetSymbols, store.quotes, error).map(displayQuoteAfterFailure);
  }

  for (const quote of quotesToPersist(quotes)) {
    store.quotes[quote.symbol] = quote;
  }
  return quotes;
}

export async function getLiveQuotes(symbols: string[]) {
  if (!symbols.length) {
    return [];
  }

  const provider = getQuoteProvider();
  try {
    const fetchedAt = new Date().toISOString();
    let quotes: Quote[] = (await provider.getQuotes(symbols)).map((quote) => ({ ...quote, fetchedAt }));
    if (hasFailedQuotes(quotes)) {
      const latestQuotes = shouldUseDatabase()
        ? await latestQuotesFromDatabase(await getPrisma(), symbols)
        : getStore().quotes;
      quotes = replaceFailedQuotesWithLatest(quotes, latestQuotes);
    }
    return quotes;
  } catch (error) {
    if (shouldUseDatabase()) {
      const db = await getPrisma();
      const latestQuotes = await latestQuotesFromDatabase(db, symbols);
      return buildProviderFailureQuotes(symbols, latestQuotes, error).map(displayQuoteAfterFailure);
    }
    return buildProviderFailureQuotes(symbols, getStore().quotes, error).map(displayQuoteAfterFailure);
  }
}

async function latestQuotesFromDatabase(
  db: Awaited<ReturnType<typeof getPrisma>>,
  symbols: string[],
) {
  const snapshots = await db.quoteSnapshot.findMany({
    where: { symbol: { in: symbols } },
    orderBy: [{ quoteTime: "desc" }, { createdAt: "desc" }],
  });
  const latest: Record<string, Quote> = {};

  for (const snapshot of snapshots) {
    if (!latest[snapshot.symbol]) {
      latest[snapshot.symbol] = quoteFromSnapshot(snapshot);
    }
  }

  return latest;
}

async function latestQuoteSnapshotIdsFromDatabase(
  db: Awaited<ReturnType<typeof getPrisma>>,
  symbols: string[],
) {
  const snapshots = await db.quoteSnapshot.findMany({
    where: { symbol: { in: symbols } },
    orderBy: [{ quoteTime: "desc" }, { createdAt: "desc" }],
  });
  const latest = new Map<string, string>();

  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.symbol)) {
      latest.set(snapshot.symbol, snapshot.id);
    }
  }

  return latest;
}

function buildProviderFailureQuotes(
  symbols: string[],
  latestQuotes: Record<string, Quote>,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "行情 provider 暂时不可用。";
  const provider = process.env.QUOTE_PROVIDER ?? "auto";
  const quoteTime = new Date().toISOString();
  const fetchedAt = new Date().toISOString();

  return symbols.map((symbol) => {
    const security = securityFromSymbol(symbol);
    const previous = latestQuotes[security.normalizedSymbol];

    return {
      symbol: security.normalizedSymbol,
      price: previous?.price ?? 0,
      change: previous?.change ?? 0,
      changePercent: previous?.changePercent ?? 0,
      currency: previous?.currency ?? security.currency,
      marketStatus: previous?.marketStatus ?? "unknown",
      provider,
      quoteTime: previous?.quoteTime ?? quoteTime,
      fetchedAt,
      status: "error",
      errorCode: "PROVIDER_UNAVAILABLE",
      errorMessage: `行情暂时不可用，当前显示的是上次成功更新的数据。${message}`,
    } satisfies Quote;
  });
}

export async function getWatchlistItems() {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const records = await db.watchlistItem.findMany({
      orderBy: { createdAt: "desc" },
    });
    return records.map(watchlistItemFromRecord);
  }

  return getStore().watchlist;
}

export async function getQuoteSnapshots(symbols?: string[]) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const records = await db.quoteSnapshot.findMany({
      where: symbols?.length ? { symbol: { in: symbols } } : undefined,
      orderBy: [{ symbol: "asc" }, { quoteTime: "desc" }, { createdAt: "desc" }],
    });
    return records.map(quoteFromSnapshot);
  }

  const store = getStore();
  const selected = symbols?.length ? symbols : Object.keys(store.quotes);
  return selected.map((symbol) => store.quotes[symbol]).filter(Boolean);
}

export async function searchFunds(keyword: string): Promise<FundSearchResult[]> {
  const query = keyword.trim();
  if (!query) return [];
  return getFundProvider().searchFunds(query);
}

export async function listFundRows(): Promise<FundRow[]> {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const records = (await db.fundWatchlistItem.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        snapshots: {
          orderBy: [{ quoteTime: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    })) as Array<FundWatchlistRecord & { snapshots: FundSnapshotRecord[] }>;

    return records.map((record) => {
      const snapshot = record.snapshots[0] ? fundSnapshotFromRecord(record.snapshots[0]) : null;
      return {
        ...fundItemFromRecord(record),
        snapshot,
        dataStatus: snapshot?.status ?? "stale",
      };
    });
  }

  const store = getStore();
  return store.funds.map((item) => {
    const snapshot = store.fundSnapshots[item.normalizedSymbol] ?? null;
    return {
      ...item,
      snapshot,
      dataStatus: snapshot?.status ?? "stale",
    };
  });
}

export async function addFundItem(input: { symbol: string; type?: FundItem["type"]; name?: string }) {
  const fund = await resolveFundForWatchlist(input);
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const existing = await db.fundWatchlistItem.findUnique({
      where: { normalizedSymbol: fund.normalizedSymbol },
    });

    if (existing) {
      if (existing.name === existing.code || existing.name === existing.normalizedSymbol) {
        const updated = await db.fundWatchlistItem.update({
          where: { id: existing.id },
          data: { name: fund.name },
        });
        return fundItemFromRecord(updated);
      }
      return fundItemFromRecord(existing);
    }

    const created = await db.fundWatchlistItem.create({
      data: {
        code: fund.code,
        normalizedSymbol: fund.normalizedSymbol,
        type: fund.type,
        market: fund.market,
        name: fund.name,
        currency: fund.currency,
      },
    });
    await refreshFunds([created.normalizedSymbol]);
    return fundItemFromRecord(created);
  }

  const store = getStore();
  const existing = store.funds.find((item) => item.normalizedSymbol === fund.normalizedSymbol);
  if (existing) {
    if (existing.name === existing.code || existing.name === existing.normalizedSymbol) {
      existing.name = fund.name;
      existing.updatedAt = now();
    }
    return existing;
  }

  const timestamp = now();
  const item: FundItem = {
    id: crypto.randomUUID(),
    code: fund.code,
    normalizedSymbol: fund.normalizedSymbol,
    type: fund.type,
    market: fund.market,
    name: fund.name,
    currency: fund.currency,
    costPrice: undefined,
    shares: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.funds.unshift(item);
  await refreshFunds([item.normalizedSymbol]);
  return item;
}

async function resolveFundForWatchlist(input: { symbol: string; type?: FundItem["type"]; name?: string }) {
  const fallback = fundFromSymbol(input.symbol, input.type);
  if (input.name?.trim()) {
    return { ...fallback, name: input.name.trim() };
  }

  try {
    const results = await searchFunds(fallback.code);
    return results.find((item) => item.normalizedSymbol === fallback.normalizedSymbol) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function updateFundHolding(
  id: string,
  input: { costPrice?: number | null; shares?: number | null },
) {
  const clearing = input.costPrice === null && input.shares === null;
  const costPrice = input.costPrice;
  const shares = input.shares;
  const holding =
    typeof costPrice === "number" && typeof shares === "number" ? { costPrice, shares } : null;

  if (!clearing && !holding) {
    throw new AppError("VALIDATION_ERROR", "请同时填写成本价和份额。", 400);
  }

  if (holding && (holding.costPrice <= 0 || holding.shares <= 0)) {
    throw new AppError("VALIDATION_ERROR", "成本价和份额必须大于 0。", 400);
  }

  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const item = await db.fundWatchlistItem.findUnique({ where: { id } });
    if (!item) {
      throw new AppError("NOT_FOUND", "没有找到这只基金。", 404);
    }

    const updated = await db.fundWatchlistItem.update({
      where: { id },
      data: clearing
        ? { costPrice: null, shares: null }
        : { costPrice: holding!.costPrice.toString(), shares: holding!.shares.toString() },
    });
    return fundItemFromRecord(updated);
  }

  const store = getStore();
  const item = store.funds.find((entry) => entry.id === id);
  if (!item) {
    throw new AppError("NOT_FOUND", "没有找到这只基金。", 404);
  }

  item.costPrice = clearing ? undefined : holding!.costPrice;
  item.shares = clearing ? undefined : holding!.shares;
  item.updatedAt = now();
  return item;
}

export async function deleteFundItem(id: string) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const item = await db.fundWatchlistItem.findUnique({ where: { id } });
    if (!item) {
      throw new AppError("NOT_FOUND", "没有找到这只基金。", 404);
    }
    await db.fundWatchlistItem.delete({ where: { id } });
    return;
  }

  const store = getStore();
  const item = store.funds.find((entry) => entry.id === id);
  if (!item) {
    throw new AppError("NOT_FOUND", "没有找到这只基金。", 404);
  }
  store.funds = store.funds.filter((entry) => entry.id !== id);
  delete store.fundSnapshots[item.normalizedSymbol];
}

export async function refreshFunds(symbols?: string[]) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const targetSymbols =
      symbols ??
      (
        await db.fundWatchlistItem.findMany({
          select: { normalizedSymbol: true },
          orderBy: { createdAt: "desc" },
        })
      ).map((item) => item.normalizedSymbol);

    if (!targetSymbols.length) return [];

    const snapshots = await getFundSnapshotsSafely(targetSymbols);
    const fundItems = (await db.fundWatchlistItem.findMany({
      where: { normalizedSymbol: { in: targetSymbols } },
      select: { id: true, normalizedSymbol: true },
    })) as Array<{ id: string; normalizedSymbol: string }>;
    const idBySymbol = new Map(fundItems.map((item) => [item.normalizedSymbol, item.id]));
    const snapshotIdBySymbol = await latestFundSnapshotIdsFromDatabase(db, targetSymbols);

    await db.$transaction(
      snapshots.flatMap((snapshot) => {
        const fundItemId = idBySymbol.get(snapshot.symbol);
        if (!fundItemId) return [];

        const data = {
          fundItemId,
          symbol: snapshot.symbol,
          netValue: snapshot.netValue.toString(),
          estimateValue: snapshot.estimateValue?.toString(),
          changePercent: snapshot.changePercent.toString(),
          currency: snapshot.currency,
          provider: snapshot.provider,
          quoteTime: new Date(snapshot.quoteTime),
          errorCode: snapshot.errorCode,
          errorMessage: snapshot.errorMessage,
        };
        const snapshotId = snapshotIdBySymbol.get(snapshot.symbol);

        return snapshotId
          ? db.fundSnapshot.update({
              where: { id: snapshotId },
              data,
            })
          : db.fundSnapshot.create({
              data,
            });
      }),
    );

    return snapshots;
  }

  const store = getStore();
  const targetSymbols = symbols ?? store.funds.map((item) => item.normalizedSymbol);
  if (!targetSymbols.length) return [];

  const snapshots = await getFundSnapshotsSafely(targetSymbols);
  for (const snapshot of snapshots) {
    store.fundSnapshots[snapshot.symbol] = snapshot;
  }
  return snapshots;
}

export async function getLiveFundSnapshots(symbols: string[]) {
  if (!symbols.length) return [];
  return getFundSnapshotsSafely(symbols);
}

async function getFundSnapshotsSafely(symbols: string[]) {
  try {
    const fetchedAt = new Date().toISOString();
    return (await getFundProvider().getFundSnapshots(symbols)).map((snapshot) => ({
      ...snapshot,
      fetchedAt,
    }));
  } catch (error) {
    if (shouldUseDatabase()) {
      const db = await getPrisma();
      const latestSnapshots = await latestFundSnapshotsFromDatabase(db, symbols);
      return buildFundFailureSnapshots(symbols, latestSnapshots, error);
    }
    return buildFundFailureSnapshots(symbols, getStore().fundSnapshots, error);
  }
}

async function latestFundSnapshotsFromDatabase(
  db: Awaited<ReturnType<typeof getPrisma>>,
  symbols: string[],
) {
  const snapshots = await db.fundSnapshot.findMany({
    where: { symbol: { in: symbols } },
    orderBy: [{ quoteTime: "desc" }, { createdAt: "desc" }],
  });
  const latest: Record<string, FundSnapshot> = {};

  for (const snapshot of snapshots) {
    if (!latest[snapshot.symbol]) {
      latest[snapshot.symbol] = fundSnapshotFromRecord(snapshot);
    }
  }

  return latest;
}

async function latestFundSnapshotIdsFromDatabase(
  db: Awaited<ReturnType<typeof getPrisma>>,
  symbols: string[],
) {
  const snapshots = await db.fundSnapshot.findMany({
    where: { symbol: { in: symbols } },
    orderBy: [{ quoteTime: "desc" }, { createdAt: "desc" }],
  });
  const latest = new Map<string, string>();

  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.symbol)) {
      latest.set(snapshot.symbol, snapshot.id);
    }
  }

  return latest;
}

function buildFundFailureSnapshots(
  symbols: string[],
  latestSnapshots: Record<string, FundSnapshot>,
  error: unknown,
): FundSnapshot[] {
  const message = error instanceof Error ? error.message : "基金数据暂时不可用。";
  const quoteTime = new Date().toISOString();
  return symbols.map((symbol) => {
    const fund = fundFromSymbol(symbol);
    const previous = latestSnapshots[fund.normalizedSymbol];

    return {
      symbol: fund.normalizedSymbol,
      netValue: previous?.netValue ?? 0,
      estimateValue: previous?.estimateValue,
      changePercent: previous?.changePercent ?? 0,
      currency: previous?.currency ?? fund.currency,
      provider: process.env.FUND_PROVIDER ?? "public",
      quoteTime: previous?.quoteTime ?? quoteTime,
      fetchedAt: quoteTime,
      status: "error",
      errorCode: "PROVIDER_UNAVAILABLE",
      errorMessage: `基金数据暂时不可用。${message}`,
    };
  });
}

export async function getEmailSetting() {
  const localSetting = getLocalEmailSetting();
  if (localSetting) return localSetting;
  return getStore().emailSetting;
}

export async function updateEmailSetting(input: Partial<EmailDigestSetting>) {
  const current = await getEmailSetting();
  const next = {
    ...current,
    ...input,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now(),
  };
  getStore().emailSetting = next;
  return saveLocalEmailSetting(next);
}

export async function getIntegrationSetting(kind: IntegrationKind) {
  const localSetting = getLocalIntegrationSetting(kind);
  if (localSetting) {
    return localSetting;
  }

  const fallbackSetting = getStore().integrations[kind];
  if (fallbackSetting) {
    return fallbackSetting;
  }

  return null;
}

export async function upsertModelIntegration(input: {
  baseUrl: string;
  modelName: string;
  apiKey?: string;
}) {
  const existing = await getIntegrationSetting("model");
  if (!existing?.secret && !input.apiKey?.trim()) {
    throw new AppError("VALIDATION_ERROR", "请输入 API Key 后再保存 Chat 配置。", 400);
  }

  const timestamp = now();
  const next: IntegrationSetting = {
    id: existing?.id ?? "model-integration",
    kind: "model",
    provider: "openai-compatible",
    baseUrl: input.baseUrl.trim(),
    modelName: input.modelName.trim(),
    secret: existing?.secret,
    secretPreview: existing?.secretPreview,
    lastTestStatus: existing?.lastTestStatus ?? "untested",
    lastTestMessage: existing?.lastTestMessage,
    lastTestedAt: existing?.lastTestedAt,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    next.secret = apiKey;
    next.secretPreview = maskSecret(apiKey);
    next.lastTestStatus = "untested";
    next.lastTestMessage = "已保存 API Key，尚未测试模型连接。";
    next.lastTestedAt = undefined;
  }

  getStore().integrations.model = saveLocalIntegrationSetting(next);
  return publicIntegrationFromSetting("model", next);
}

export async function upsertEmailIntegration(input: {
  smtpUrl?: string;
  from?: string;
}) {
  const existing = await getIntegrationSetting("email");
  const timestamp = now();
  const next: IntegrationSetting = {
    id: existing?.id ?? "email-integration",
    kind: "email",
    provider: "smtp",
    baseUrl: input.from?.trim() || existing?.baseUrl,
    secret: existing?.secret,
    secretPreview: existing?.secretPreview,
    lastTestStatus: "untested",
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const smtpUrl = input.smtpUrl?.trim();
  if (smtpUrl) {
    next.secret = smtpUrl;
    next.secretPreview = maskSecret(smtpUrl);
  }

  getStore().integrations.email = saveLocalIntegrationSetting(next);
  return publicIntegrationFromSetting("email", next);
}

export async function resolveEmailProviderConfig() {
  const setting = await getIntegrationSetting("email");
  if (setting?.secret && setting.baseUrl) {
    return {
      provider: "smtp",
      source: "file",
      smtpUrl: setting.secret,
      from: setting.baseUrl,
    };
  }

  if (process.env.SMTP_URL && process.env.EMAIL_FROM) {
    return {
      provider: "smtp",
      source: "env",
      smtpUrl: process.env.SMTP_URL,
      from: process.env.EMAIL_FROM,
    };
  }

  return {
    provider: process.env.EMAIL_PROVIDER === "smtp" ? "smtp" : "unconfigured",
    source: "unconfigured",
  };
}

export async function deleteModelIntegrationSecret() {
  const existing = await getIntegrationSetting("model");
  if (!existing) {
    return publicIntegration("model");
  }

  const next = {
    ...existing,
    secret: undefined,
    secretPreview: undefined,
    updatedAt: now(),
  };

  getStore().integrations.model = saveLocalIntegrationSetting(next);
  return publicIntegrationFromSetting("model", next);
}

export async function markIntegrationTest(
  kind: IntegrationKind,
  status: "success" | "failed",
  message: string,
) {
  const existing = await getIntegrationSetting(kind);
  const timestamp = now();
  const next: IntegrationSetting = {
    id: existing?.id ?? `${kind}-integration`,
    kind,
    provider: existing?.provider ?? defaultProvider(kind),
    baseUrl: existing?.baseUrl,
    modelName: existing?.modelName,
    secret: existing?.secret,
    secretPreview: existing?.secretPreview,
    lastTestStatus: status,
    lastTestMessage: message,
    lastTestedAt: timestamp,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  getStore().integrations[kind] = saveLocalIntegrationSetting(next);
  return publicIntegrationFromSetting(kind, next);
}

function defaultProvider(kind: IntegrationKind) {
  if (kind === "model") return process.env.MODEL_PROVIDER ?? "openai-compatible";
  if (kind === "quote") return process.env.QUOTE_PROVIDER ?? "auto";
  if (kind === "news") return process.env.NEWS_PROVIDER ?? "public";
  return process.env.EMAIL_PROVIDER ?? "smtp";
}

async function publicIntegration(kind: IntegrationKind): Promise<PublicIntegrationSetting> {
  const setting = await getIntegrationSetting(kind);
  return publicIntegrationFromSetting(kind, setting);
}

function publicIntegrationFromSetting(
  kind: IntegrationKind,
  setting: IntegrationSetting | null,
): PublicIntegrationSetting {
  if (kind === "model") {
    const envConfigured = Boolean(
      process.env.MODEL_BASE_URL && process.env.MODEL_API_KEY && process.env.MODEL_NAME,
    );
    const fileConfigured = Boolean(setting?.baseUrl || setting?.modelName || setting?.secret);
    const testMock = process.env.NODE_ENV === "test" && process.env.MODEL_PROVIDER === "mock";
    const source = fileConfigured
      ? "file"
      : envConfigured
        ? "env"
        : testMock
          ? "mock"
          : "unconfigured";
    const provider = source === "mock" ? "mock" : "openai-compatible";
    const secretPreview =
      setting?.secretPreview ??
      (envConfigured ? maskSecret(process.env.MODEL_API_KEY ?? "") : undefined);

    return {
      kind,
      provider,
      source,
      label: "AI Chat",
      description:
        source === "unconfigured"
          ? "真实模型尚未配置，请填写 OpenAI-compatible 连接信息。"
          : source === "mock"
            ? "测试环境正在使用 mock 模型。"
            : "已准备通过 OpenAI-compatible API 回答问题。",
      status:
        setting?.lastTestStatus ??
        (source === "unconfigured" || source === "mock" ? "failed" : "untested"),
      statusMessage:
        setting?.lastTestMessage ??
        (source === "unconfigured" || source === "mock"
          ? "真实模型未配置，请填写 Base URL、模型名称和 API Key。"
          : "尚未测试模型连接。"),
      baseUrl: setting?.baseUrl ?? process.env.MODEL_BASE_URL,
      modelName: setting?.modelName ?? process.env.MODEL_NAME,
      secretConfigured: Boolean(setting?.secret || envConfigured),
      secretPreview,
      lastTestedAt: setting?.lastTestedAt,
    };
  }

  const envProvider = defaultProvider(kind);
  const emailConfigured = kind === "email" && Boolean(setting?.secret && setting.baseUrl);
  const emailEnvConfigured =
    kind === "email" && Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM);
  const emailPartialFileConfig =
    kind === "email" &&
    setting?.provider === "smtp" &&
    Boolean(setting.baseUrl) &&
    !setting.secret;
  const emailUnconfigured =
    kind === "email" && !emailConfigured && !emailEnvConfigured && !emailPartialFileConfig;
  const emailMisconfigured =
    kind === "email" && envProvider === "smtp" && !emailConfigured && !emailEnvConfigured;
  const provider = emailConfigured || emailPartialFileConfig ? "smtp" : envProvider;
  const statusMessage =
    provider === "mock" ? `${labelForKind(kind)}测试 provider 可用。` : "尚未测试连接。";
  const status =
    setting?.lastTestStatus ??
    (emailMisconfigured || emailUnconfigured
      ? "failed"
      : provider === "mock"
        ? "success"
        : "untested");
  const staleMockMessage =
    kind === "email" &&
    provider === "smtp" &&
    setting?.lastTestMessage?.includes("mock provider");
  const lastTestMessage = staleMockMessage ? undefined : setting?.lastTestMessage;

  return {
    kind,
    provider,
    source: emailConfigured
      ? "file"
      : emailPartialFileConfig
        ? "unconfigured"
        : envProvider === "mock"
          ? "mock"
          : emailMisconfigured
            ? "unconfigured"
            : "env",
    label: labelForKind(kind),
    description: descriptionForKind(kind, provider),
    status: emailPartialFileConfig ? "failed" : staleMockMessage ? "untested" : status,
    statusMessage:
      lastTestMessage ??
      (emailMisconfigured
        ? "SMTP 配置不完整，请设置 SMTP_URL 和 EMAIL_FROM。"
        : emailPartialFileConfig
          ? "请输入 SMTP 授权码并保存邮件连接。"
          : emailUnconfigured
            ? "真实邮件未配置，请设置 SMTP_URL 和 EMAIL_FROM。"
            : statusMessage),
    baseUrl: kind === "email" ? setting?.baseUrl ?? process.env.EMAIL_FROM : undefined,
    secretConfigured:
      kind === "email" ? Boolean(setting?.secret || process.env.SMTP_URL) : false,
    secretPreview:
      kind === "email"
        ? setting?.secretPreview ??
          (process.env.SMTP_URL ? maskSecret(process.env.SMTP_URL) : undefined)
        : undefined,
    lastTestedAt: setting?.lastTestedAt,
  };
}

function labelForKind(kind: IntegrationKind) {
  if (kind === "quote") return "行情";
  if (kind === "news") return "新闻";
  if (kind === "email") return "邮件";
  return "AI Chat";
}

function descriptionForKind(kind: IntegrationKind, provider: string) {
  if (kind === "quote") {
    return provider === "mock" ? "测试环境正在使用模拟行情。" : "已配置真实行情 provider。";
  }
  if (kind === "news") {
    return provider === "mock" ? "测试环境正在使用模拟新闻。" : "已配置真实新闻 provider。";
  }
  if (kind === "email") {
    return provider === "mock" ? "测试环境正在使用模拟邮件。" : "已配置真实邮件 provider。";
  }
  return "模型连接状态。";
}

export async function listPublicIntegrations() {
  return Promise.all(
    (["model", "quote", "news", "email"] as const).map((kind) => publicIntegration(kind)),
  );
}

export function resetStoreForTests() {
  globalStore.tradeStore = createInitialStore();
  resetLocalSettingsForTests();
  resetLocalDigestStateForTests();
}
