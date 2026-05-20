import type {
  ChatMessage,
  EmailDigestSetting,
  IntegrationKind,
  IntegrationSetting,
  JobRunRecord,
  Market,
  NewsArticle,
  NewsDigestRecord,
  PublicIntegrationSetting,
  Quote,
  WatchlistItem,
  WatchlistRow,
} from "@/lib/domain/types";
import { AppError } from "@/lib/domain/errors";
import { securityFromSymbol } from "@/lib/domain/symbols";
import {
  getPrisma,
  shouldUseDatabase,
  type ChatMessageRecord,
  type ChatSessionRecord,
  type EmailDigestSettingRecord,
  type IntegrationSettingRecord,
  type JobRunRecord as PrismaJobRunRecord,
  type NewsDigestRecord as PrismaNewsDigestRecord,
  type QuoteSnapshotRecord,
  type WatchlistRecord,
} from "@/lib/db/prisma";
import { getNewsProvider } from "@/lib/providers/news";
import { getQuoteProvider } from "@/lib/providers/quotes";
import { encryptSecret, hasSettingsEncryptionKey, maskSecret } from "@/lib/utils/secrets";

type StoreState = {
  watchlist: WatchlistItem[];
  quotes: Record<string, Quote>;
  emailSetting: EmailDigestSetting;
  integrations: Partial<Record<IntegrationKind, IntegrationSetting>>;
  chatMessages: ChatMessage[];
  newsDigests: NewsDigestRecord[];
  jobRuns: JobRunRecord[];
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
    emailSetting: {
      id: "default-email-setting",
      enabled: false,
      recipientEmail: "",
      sendTime: "08:30",
      timezone: process.env.APP_TIMEZONE || "Asia/Shanghai",
      markets: ["US", "HK", "CN"],
      watchlistOnly: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    integrations: {},
    chatMessages: [],
    newsDigests: [],
    jobRuns: [],
  };
}

function getStore() {
  globalStore.tradeStore ??= createInitialStore();
  globalStore.tradeStore.integrations ??= {};
  return globalStore.tradeStore;
}

function watchlistItemFromRecord(record: WatchlistRecord): WatchlistItem {
  return {
    id: record.id,
    symbol: record.symbol,
    normalizedSymbol: record.normalizedSymbol,
    market: record.market,
    name: record.name,
    currency: record.currency,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
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
    fetchedAt: snapshot.createdAt?.toISOString(),
    status: snapshot.errorCode ? "error" : "ok",
    errorCode: snapshot.errorCode ?? undefined,
    errorMessage: snapshot.errorMessage ?? undefined,
  };
}

function emailSettingFromRecord(record: EmailDigestSettingRecord): EmailDigestSetting {
  return {
    id: record.id,
    enabled: record.enabled,
    recipientEmail: record.recipientEmail,
    sendTime: record.sendTime,
    timezone: record.timezone,
    markets: record.markets,
    watchlistOnly: record.watchlistOnly,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function newsDigestFromRecord(record: PrismaNewsDigestRecord): NewsDigestRecord {
  return {
    id: record.id,
    date: record.date.toISOString(),
    recipientEmail: record.recipientEmail,
    title: record.title,
    content: record.content,
    articleIds: record.articleIds,
    emailStatus: record.emailStatus,
    sentAt: record.sentAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function jobRunFromRecord(record: PrismaJobRunRecord): JobRunRecord {
  return {
    id: record.id,
    jobType: record.jobType,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString(),
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
  };
}

function chatMessageFromRecord(record: ChatMessageRecord): ChatMessage {
  return {
    id: record.id,
    role: record.role as ChatMessage["role"],
    content: record.content,
    createdAt: record.createdAt.toISOString(),
  };
}

function integrationFromRecord(record: IntegrationSettingRecord): IntegrationSetting {
  return {
    id: record.id,
    kind: record.kind as IntegrationKind,
    provider: record.provider,
    baseUrl: record.baseUrl ?? undefined,
    modelName: record.modelName ?? undefined,
    encryptedSecret: record.encryptedSecret ?? undefined,
    secretPreview: record.secretPreview ?? undefined,
    lastTestStatus: record.lastTestStatus as IntegrationSetting["lastTestStatus"],
    lastTestMessage: record.lastTestMessage ?? undefined,
    lastTestedAt: record.lastTestedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
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
    const articles = await getNewsProvider().fetchMarketNews({ symbols, hours: 24 });
    const newsCountBySymbol = new Map<string, number>();

    for (const article of articles) {
      for (const symbol of article.symbols) {
        newsCountBySymbol.set(symbol, (newsCountBySymbol.get(symbol) ?? 0) + 1);
      }
    }

    return records.map((record) => {
      const quote = record.quoteSnapshots[0] ? quoteFromSnapshot(record.quoteSnapshots[0]) : null;
      return {
        ...watchlistItemFromRecord(record),
        quote,
        todayNewsCount: newsCountBySymbol.get(record.normalizedSymbol) ?? 0,
        dataStatus: quote?.status ?? "stale",
      };
    });
  }

  const store = getStore();
  const newsProvider = getNewsProvider();
  const symbols = store.watchlist.map((item) => item.normalizedSymbol);
  const articles = await newsProvider.fetchMarketNews({ symbols, hours: 24 });
  const newsCountBySymbol = new Map<string, number>();

  for (const article of articles) {
    for (const symbol of article.symbols) {
      newsCountBySymbol.set(symbol, (newsCountBySymbol.get(symbol) ?? 0) + 1);
    }
  }

  return store.watchlist.map((item) => {
    const quote = store.quotes[item.normalizedSymbol] ?? null;
    return {
      ...item,
      quote,
      todayNewsCount: newsCountBySymbol.get(item.normalizedSymbol) ?? 0,
      dataStatus: quote?.status ?? "stale",
    };
  });
}

export async function addWatchlistItem(input: { symbol: string; market?: Market }) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const security = securityFromSymbol(input.symbol, input.market);
    const existing = await db.watchlistItem.findUnique({
      where: { normalizedSymbol: security.normalizedSymbol },
    });

    if (existing) {
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
  const security = securityFromSymbol(input.symbol, input.market);
  const exists = store.watchlist.find(
    (item) => item.normalizedSymbol === security.normalizedSymbol,
  );

  if (exists) {
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.watchlist.unshift(item);
  await refreshQuotes([item.normalizedSymbol]);
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
    } catch (error) {
      const latestQuotes = await latestQuotesFromDatabase(db, targetSymbols);
      quotes = buildProviderFailureQuotes(targetSymbols, latestQuotes, error);
    }

    const watchlistItems = (await db.watchlistItem.findMany({
      where: { normalizedSymbol: { in: targetSymbols } },
      select: { id: true, normalizedSymbol: true },
    })) as Array<{ id: string; normalizedSymbol: string }>;
    const itemBySymbol = new Map(
      watchlistItems.map((item) => [item.normalizedSymbol, item.id]),
    );

    await db.$transaction(
      quotes.flatMap((quote) => {
        const watchlistItemId = itemBySymbol.get(quote.symbol);
        if (!watchlistItemId) {
          return [];
        }

        return db.quoteSnapshot.create({
          data: {
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
          },
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
  } catch (error) {
    quotes = buildProviderFailureQuotes(targetSymbols, store.quotes, error);
  }

  for (const quote of quotes) {
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
    return (await provider.getQuotes(symbols)).map((quote) => ({ ...quote, fetchedAt }));
  } catch (error) {
    if (shouldUseDatabase()) {
      const db = await getPrisma();
      const latestQuotes = await latestQuotesFromDatabase(db, symbols);
      return buildProviderFailureQuotes(symbols, latestQuotes, error);
    }
    return buildProviderFailureQuotes(symbols, getStore().quotes, error);
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

function buildProviderFailureQuotes(
  symbols: string[],
  latestQuotes: Record<string, Quote>,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "行情 provider 暂时不可用。";
  const provider = process.env.QUOTE_PROVIDER ?? "mock";
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
      marketStatus: previous?.marketStatus ?? "closed",
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
      distinct: ["symbol"],
      orderBy: [{ symbol: "asc" }, { quoteTime: "desc" }, { createdAt: "desc" }],
    });
    return records.map(quoteFromSnapshot);
  }

  const store = getStore();
  const selected = symbols?.length ? symbols : Object.keys(store.quotes);
  return selected.map((symbol) => store.quotes[symbol]).filter(Boolean);
}

export async function saveNewsArticles(articles: NewsArticle[]) {
  if (!articles.length || !shouldUseDatabase()) {
    return articles;
  }

  const db = await getPrisma();
  await db.$transaction(
    articles.map((article) =>
      db.newsArticle.upsert({
        where: { url: article.url },
        update: {
          title: article.title,
          summary: article.summary,
          source: article.source,
          symbols: article.symbols,
          market: article.market,
          publishedAt: new Date(article.publishedAt),
          importanceScore: article.importanceScore,
        },
        create: {
          title: article.title,
          summary: article.summary,
          url: article.url,
          source: article.source,
          symbols: article.symbols,
          market: article.market,
          publishedAt: new Date(article.publishedAt),
          importanceScore: article.importanceScore,
        },
      }),
    ),
  );

  return articles;
}

export async function getEmailSetting() {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.emailDigestSetting.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (record) {
      return emailSettingFromRecord(record);
    }

    const initial = getStore().emailSetting;
    const created = await db.emailDigestSetting.create({
      data: {
        enabled: initial.enabled,
        recipientEmail: initial.recipientEmail,
        sendTime: initial.sendTime,
        timezone: initial.timezone,
        markets: initial.markets,
        watchlistOnly: initial.watchlistOnly,
      },
    });
    return emailSettingFromRecord(created);
  }

  return getStore().emailSetting;
}

export async function updateEmailSetting(input: Partial<EmailDigestSetting>) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const current = await getEmailSetting();
    const updated = await db.emailDigestSetting.update({
      where: { id: current.id },
      data: {
        enabled: input.enabled ?? current.enabled,
        recipientEmail: input.recipientEmail ?? current.recipientEmail,
        sendTime: input.sendTime ?? current.sendTime,
        timezone: input.timezone ?? current.timezone,
        markets: input.markets ?? current.markets,
        watchlistOnly: input.watchlistOnly ?? current.watchlistOnly,
      },
    });
    return emailSettingFromRecord(updated);
  }

  const store = getStore();
  store.emailSetting = {
    ...store.emailSetting,
    ...input,
    id: store.emailSetting.id,
    createdAt: store.emailSetting.createdAt,
    updatedAt: now(),
  };
  return store.emailSetting;
}

export async function findNewsDigest(input: {
  date: Date;
  recipientEmail: string;
}) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.newsDigest.findUnique({
      where: {
        date_recipientEmail: {
          date: input.date,
          recipientEmail: input.recipientEmail,
        },
      },
    });
    return record ? newsDigestFromRecord(record) : null;
  }

  const dateKey = input.date.toISOString();
  return (
    getStore().newsDigests.find(
      (digest) => digest.date === dateKey && digest.recipientEmail === input.recipientEmail,
    ) ?? null
  );
}

export async function createNewsDigest(input: {
  date: Date;
  recipientEmail: string;
  title: string;
  content: string;
  articleIds: string[];
}) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.newsDigest.create({
      data: {
        date: input.date,
        recipientEmail: input.recipientEmail,
        title: input.title,
        content: input.content,
        articleIds: input.articleIds,
      },
    });
    return newsDigestFromRecord(record);
  }

  const record: NewsDigestRecord = {
    id: crypto.randomUUID(),
    date: input.date.toISOString(),
    recipientEmail: input.recipientEmail,
    title: input.title,
    content: input.content,
    articleIds: input.articleIds,
    emailStatus: "draft",
    createdAt: now(),
  };
  getStore().newsDigests.push(record);
  return record;
}

export async function markNewsDigestEmailStatus(
  id: string,
  status: "sent" | "failed",
) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.newsDigest.update({
      where: { id },
      data: {
        emailStatus: status,
        sentAt: status === "sent" ? new Date() : null,
      },
    });
    return newsDigestFromRecord(record);
  }

  const store = getStore();
  const digest = store.newsDigests.find((item) => item.id === id);
  if (!digest) {
    throw new AppError("NOT_FOUND", "没有找到这份摘要记录。", 404);
  }

  digest.emailStatus = status;
  digest.sentAt = status === "sent" ? now() : undefined;
  return digest;
}

export async function startJobRun(jobType: string) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.jobRun.create({
      data: {
        jobType,
        status: "running",
      },
    });
    return jobRunFromRecord(record);
  }

  const record: JobRunRecord = {
    id: crypto.randomUUID(),
    jobType,
    status: "running",
    startedAt: now(),
  };
  getStore().jobRuns.push(record);
  return record;
}

export async function finishJobRun(
  id: string,
  status: "success" | "failed",
  error?: { code?: string; message?: string },
) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.jobRun.update({
      where: { id },
      data: {
        status,
        finishedAt: new Date(),
        errorCode: error?.code,
        errorMessage: error?.message,
      },
    });
    return jobRunFromRecord(record);
  }

  const run = getStore().jobRuns.find((item) => item.id === id);
  if (!run) {
    throw new AppError("NOT_FOUND", "没有找到这次任务运行记录。", 404);
  }

  run.status = status;
  run.finishedAt = now();
  run.errorCode = error?.code;
  run.errorMessage = error?.message;
  return run;
}

async function getDefaultChatSessionId() {
  const db = await getPrisma();
  const existing = (await db.chatSession.findFirst({
    orderBy: { createdAt: "asc" },
  })) as ChatSessionRecord | null;

  if (existing) {
    return existing.id;
  }

  const created = await db.chatSession.create({
    data: { title: "默认研究对话" },
  });
  return created.id;
}

export async function addChatMessage(message: Omit<ChatMessage, "id" | "createdAt">) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const sessionId = await getDefaultChatSessionId();
    const created = await db.chatMessage.create({
      data: {
        sessionId,
        role: message.role,
        content: message.content,
      },
    });
    return chatMessageFromRecord(created);
  }

  const fullMessage: ChatMessage = {
    ...message,
    id: crypto.randomUUID(),
    createdAt: now(),
  };
  getStore().chatMessages.push(fullMessage);
  return fullMessage;
}

export async function listRecentChatMessages(limit = 12) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const sessionId = await getDefaultChatSessionId();
    const records = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return records.map(chatMessageFromRecord).reverse();
  }

  return getStore().chatMessages.slice(-limit);
}

export async function getIntegrationSetting(kind: IntegrationKind) {
  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.integrationSetting.findUnique({ where: { kind } });
    return record ? integrationFromRecord(record) : null;
  }

  return getStore().integrations[kind] ?? null;
}

export async function upsertModelIntegration(input: {
  baseUrl: string;
  modelName: string;
  apiKey?: string;
}) {
  const existing = await getIntegrationSetting("model");
  const timestamp = now();
  const next: IntegrationSetting = {
    id: existing?.id ?? "model-integration",
    kind: "model",
    provider: "openai-compatible",
    baseUrl: input.baseUrl.trim(),
    modelName: input.modelName.trim(),
    encryptedSecret: existing?.encryptedSecret,
    secretPreview: existing?.secretPreview,
    lastTestStatus: existing?.lastTestStatus ?? "untested",
    lastTestMessage: existing?.lastTestMessage,
    lastTestedAt: existing?.lastTestedAt,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    if (!hasSettingsEncryptionKey()) {
      throw new AppError(
        "VALIDATION_ERROR",
        "缺少 SETTINGS_ENCRYPTION_KEY，不能保存 API Key。",
        400,
      );
    }
    next.encryptedSecret = encryptSecret(apiKey);
    next.secretPreview = maskSecret(apiKey);
  }

  if (shouldUseDatabase()) {
    const db = await getPrisma();
    await db.integrationSetting.upsert({
      where: { kind: "model" },
      update: {
        provider: next.provider,
        baseUrl: next.baseUrl,
        modelName: next.modelName,
        encryptedSecret: next.encryptedSecret,
        secretPreview: next.secretPreview,
        lastTestStatus: next.lastTestStatus,
        lastTestMessage: next.lastTestMessage,
        lastTestedAt: next.lastTestedAt ? new Date(next.lastTestedAt) : null,
      },
      create: {
        kind: "model",
        provider: next.provider,
        baseUrl: next.baseUrl,
        modelName: next.modelName,
        encryptedSecret: next.encryptedSecret,
        secretPreview: next.secretPreview,
        lastTestStatus: next.lastTestStatus,
        lastTestMessage: next.lastTestMessage,
        lastTestedAt: next.lastTestedAt ? new Date(next.lastTestedAt) : null,
      },
    });
    return publicIntegration("model");
  }

  const store = getStore();
  store.integrations.model = next;
  return publicIntegrationFromSetting("model", next);
}

export async function deleteModelIntegrationSecret() {
  const existing = await getIntegrationSetting("model");
  if (!existing) {
    return publicIntegration("model");
  }

  const next = {
    ...existing,
    encryptedSecret: undefined,
    secretPreview: undefined,
    updatedAt: now(),
  };

  if (shouldUseDatabase()) {
    const db = await getPrisma();
    await db.integrationSetting.update({
      where: { kind: "model" },
      data: {
        encryptedSecret: null,
        secretPreview: null,
      },
    });
    return publicIntegration("model");
  }

  getStore().integrations.model = next;
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
    encryptedSecret: existing?.encryptedSecret,
    secretPreview: existing?.secretPreview,
    lastTestStatus: status,
    lastTestMessage: message,
    lastTestedAt: timestamp,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (shouldUseDatabase()) {
    const db = await getPrisma();
    await db.integrationSetting.upsert({
      where: { kind },
      update: {
        provider: next.provider,
        baseUrl: next.baseUrl,
        modelName: next.modelName,
        encryptedSecret: next.encryptedSecret,
        secretPreview: next.secretPreview,
        lastTestStatus: status,
        lastTestMessage: message,
        lastTestedAt: new Date(timestamp),
      },
      create: {
        kind,
        provider: next.provider,
        baseUrl: next.baseUrl,
        modelName: next.modelName,
        encryptedSecret: next.encryptedSecret,
        secretPreview: next.secretPreview,
        lastTestStatus: status,
        lastTestMessage: message,
        lastTestedAt: new Date(timestamp),
      },
    });
    return publicIntegration(kind);
  }

  getStore().integrations[kind] = next;
  return publicIntegrationFromSetting(kind, next);
}

function defaultProvider(kind: IntegrationKind) {
  if (kind === "model") return process.env.MODEL_PROVIDER ?? "mock";
  if (kind === "quote") return process.env.QUOTE_PROVIDER ?? "mock";
  if (kind === "news") return process.env.NEWS_PROVIDER ?? "mock";
  return process.env.EMAIL_PROVIDER ?? "mock";
}

async function publicIntegration(kind: IntegrationKind): Promise<PublicIntegrationSetting> {
  const setting = await getIntegrationSetting(kind);
  return publicIntegrationFromSetting(kind, setting);
}

function publicIntegrationFromSetting(
  kind: IntegrationKind,
  setting: IntegrationSetting | null,
): PublicIntegrationSetting {
  const encryptionConfigured = hasSettingsEncryptionKey();

  if (kind === "model") {
    const envConfigured = Boolean(
      process.env.MODEL_BASE_URL && process.env.MODEL_API_KEY && process.env.MODEL_NAME,
    );
    const dbConfigured = Boolean(setting?.baseUrl || setting?.modelName || setting?.encryptedSecret);
    const source = dbConfigured ? "database" : envConfigured ? "env" : "mock";
    const provider = source === "mock" ? "mock" : "openai-compatible";
    const secretPreview =
      setting?.secretPreview ?? (envConfigured ? maskSecret(process.env.MODEL_API_KEY ?? "") : undefined);
    return {
      kind,
      provider,
      source,
      label: "AI Chat",
      description:
        source === "mock"
          ? "当前使用 mock 模型，适合开发和验证交互。"
          : "已准备通过 OpenAI-compatible API 回答问题。",
      status: setting?.lastTestStatus ?? (source === "mock" ? "success" : "untested"),
      statusMessage:
        setting?.lastTestMessage ??
        (source === "mock" ? "Mock Chat 可用。" : "尚未测试模型连接。"),
      baseUrl: setting?.baseUrl ?? process.env.MODEL_BASE_URL,
      modelName: setting?.modelName ?? process.env.MODEL_NAME,
      secretConfigured: Boolean(setting?.encryptedSecret || envConfigured),
      secretPreview,
      encryptionConfigured,
      lastTestedAt: setting?.lastTestedAt,
    };
  }

  const envProvider = defaultProvider(kind);
  const statusMessage = envProvider === "mock" ? `${labelForKind(kind)} Mock 可用。` : "尚未测试连接。";
  return {
    kind,
    provider: envProvider,
    source: envProvider === "mock" ? "mock" : "env",
    label: labelForKind(kind),
    description: descriptionForKind(kind, envProvider),
    status: setting?.lastTestStatus ?? (envProvider === "mock" ? "success" : "untested"),
    statusMessage: setting?.lastTestMessage ?? statusMessage,
    secretConfigured: false,
    encryptionConfigured,
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
  if (kind === "quote") return provider === "mock" ? "当前展示模拟行情。" : "已配置真实行情 provider。";
  if (kind === "news") return provider === "mock" ? "当前使用模拟新闻。" : "已配置真实新闻 provider。";
  if (kind === "email") return provider === "mock" ? "当前只模拟发送邮件。" : "已配置真实邮件 provider。";
  return "模型连接状态。";
}

export async function listPublicIntegrations() {
  return Promise.all((["model", "quote", "news", "email"] as const).map((kind) => publicIntegration(kind)));
}

export function resetStoreForTests() {
  globalStore.tradeStore = createInitialStore();
}
