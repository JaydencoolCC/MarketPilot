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
  type JobRunRecord as PrismaJobRunRecord,
  type NewsDigestRecord as PrismaNewsDigestRecord,
  type QuoteSnapshotRecord,
  type WatchlistRecord,
} from "@/lib/db/prisma";
import { getNewsProvider } from "@/lib/providers/news";
import { getQuoteProvider } from "@/lib/providers/quotes";
import { decryptSecret, maskSecret } from "@/lib/utils/secrets";
import {
  getLocalEmailSetting,
  getLocalIntegrationSetting,
  resetLocalSettingsForTests,
  saveLocalEmailSetting,
  saveLocalIntegrationSetting,
} from "@/lib/settings/local-settings";

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
  const security = securityFromSymbol(record.normalizedSymbol);
  const name =
    !record.name || record.name === record.normalizedSymbol ? security.name : record.name;

  return {
    id: record.id,
    symbol: record.symbol,
    normalizedSymbol: record.normalizedSymbol,
    market: record.market,
    name,
    currency: record.currency,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function resolveSecurityForWatchlist(input: { symbol: string; market?: Market }) {
  const fallback = securityFromSymbol(input.symbol, input.market);
  try {
    const results = await getQuoteProvider().searchSymbols(fallback.normalizedSymbol, fallback.market);
    return results.find((item) => item.normalizedSymbol === fallback.normalizedSymbol) ?? fallback;
  } catch {
    return fallback;
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
    fetchedAt: snapshot.createdAt?.toISOString(),
    status: snapshot.errorCode ? "error" : "ok",
    errorCode: snapshot.errorCode ?? undefined,
    errorMessage: snapshot.errorMessage ?? undefined,
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
    const security = await resolveSecurityForWatchlist(input);
    const existing = await db.watchlistItem.findUnique({
      where: { normalizedSymbol: security.normalizedSymbol },
    });

    if (existing) {
      if (!existing.name || existing.name === existing.normalizedSymbol) {
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
    if (!exists.name || exists.name === exists.normalizedSymbol) {
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
  const localSetting = getLocalEmailSetting();
  if (localSetting) return localSetting;

  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.emailDigestSetting.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (record) {
      const setting: EmailDigestSetting = {
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
      return saveLocalEmailSetting(setting);
    }
  }

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
  const localSetting = getLocalIntegrationSetting(kind);
  if (localSetting) {
    if (kind === "model" && !localSetting.secret && shouldUseDatabase()) {
      return migrateModelSecretFromDatabase(localSetting);
    }
    return localSetting;
  }

  const fallbackSetting = getStore().integrations[kind];
  if (fallbackSetting) {
    if (kind === "model" && !fallbackSetting.secret && shouldUseDatabase()) {
      return migrateModelSecretFromDatabase(fallbackSetting);
    }
    return fallbackSetting;
  }

  if (shouldUseDatabase()) {
    const db = await getPrisma();
    const record = await db.integrationSetting.findUnique({ where: { kind } });
    if (record) {
      const setting: IntegrationSetting = {
        id: record.id,
        kind: record.kind as IntegrationKind,
        provider: record.provider,
        baseUrl: record.baseUrl ?? undefined,
        modelName: record.modelName ?? undefined,
        secretPreview: record.secretPreview ?? undefined,
        lastTestStatus: record.lastTestStatus as IntegrationSetting["lastTestStatus"],
        lastTestMessage: record.lastTestMessage ?? undefined,
        lastTestedAt: record.lastTestedAt?.toISOString(),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };
      if (!setting.secret && record.encryptedSecret) {
        try {
          setting.secret = decryptSecret(record.encryptedSecret);
        } catch {
          setting.lastTestStatus = "failed";
          setting.lastTestMessage = "旧 API Key 使用的本地密钥已变更，无法恢复。请重新输入 API Key 并保存。";
        }
      }
      return saveLocalIntegrationSetting(setting);
    }
  }

  return null;
}

async function migrateModelSecretFromDatabase(setting: IntegrationSetting) {
  const db = await getPrisma();
  const record = await db.integrationSetting.findUnique({ where: { kind: "model" } });
  if (!record?.encryptedSecret) return setting;

  const next: IntegrationSetting = {
    ...setting,
    secretPreview: setting.secretPreview ?? record.secretPreview ?? undefined,
    lastTestedAt: setting.lastTestedAt ?? record.lastTestedAt?.toISOString(),
  };

  try {
    next.secret = decryptSecret(record.encryptedSecret);
    next.lastTestStatus = record.lastTestStatus as IntegrationSetting["lastTestStatus"];
    next.lastTestMessage = record.lastTestMessage ?? undefined;
  } catch {
    next.lastTestStatus = "failed";
    next.lastTestMessage = "旧 API Key 使用的本地密钥已变更，无法恢复。请重新输入 API Key 并保存。";
  }

  return saveLocalIntegrationSetting(next);
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
    next.encryptedSecret = undefined;
    next.secretPreview = maskSecret(apiKey);
    next.lastTestStatus = "untested";
    next.lastTestMessage = "已保存 API Key，尚未测试模型连接。";
    next.lastTestedAt = undefined;
  }

  const store = getStore();
  store.integrations.model = saveLocalIntegrationSetting(next);
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
    next.encryptedSecret = undefined;
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
  if (kind === "model") return process.env.MODEL_PROVIDER ?? "mock";
  if (kind === "quote") return process.env.QUOTE_PROVIDER ?? "auto";
  if (kind === "news") return process.env.NEWS_PROVIDER ?? "public";
  return process.env.EMAIL_PROVIDER ?? (process.env.SMTP_URL ? "smtp" : "mock");
}

async function publicIntegration(kind: IntegrationKind): Promise<PublicIntegrationSetting> {
  const setting = await getIntegrationSetting(kind);
  return publicIntegrationFromSetting(kind, setting);
}

function publicIntegrationFromSetting(
  kind: IntegrationKind,
  setting: IntegrationSetting | null,
): PublicIntegrationSetting {
  const encryptionConfigured = true;

  if (kind === "model") {
    const envConfigured = Boolean(
      process.env.MODEL_BASE_URL && process.env.MODEL_API_KEY && process.env.MODEL_NAME,
    );
    const dbConfigured = Boolean(setting?.baseUrl || setting?.modelName || setting?.secret);
    const source = dbConfigured ? "file" : envConfigured ? "env" : "mock";
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
          ? "真实模型尚未配置，当前只能使用 mock 响应。"
          : "已准备通过 OpenAI-compatible API 回答问题。",
      status: setting?.lastTestStatus ?? (source === "mock" ? "failed" : "untested"),
      statusMessage:
        setting?.lastTestMessage ??
        (source === "mock" ? "真实模型未配置，请填写 Base URL、模型名称和 API Key。" : "尚未测试模型连接。"),
      baseUrl: setting?.baseUrl ?? process.env.MODEL_BASE_URL,
      modelName: setting?.modelName ?? process.env.MODEL_NAME,
      secretConfigured: Boolean(setting?.secret || envConfigured),
      secretPreview,
      encryptionConfigured,
      lastTestedAt: setting?.lastTestedAt,
    };
  }

  const envProvider = defaultProvider(kind);
  const emailConfigured = kind === "email" && Boolean(setting?.secret && setting.baseUrl);
  const emailEnvConfigured = kind === "email" && Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM);
  const emailPartialFileConfig =
    kind === "email" && setting?.provider === "smtp" && Boolean(setting.baseUrl) && !setting.secret;
  const emailUnconfigured = kind === "email" && !emailConfigured && !emailEnvConfigured && !emailPartialFileConfig;
  const emailMisconfigured = kind === "email" && envProvider === "smtp" && !emailConfigured && !emailEnvConfigured;
  const provider = emailConfigured || emailPartialFileConfig ? "smtp" : envProvider;
  const statusMessage = provider === "mock" ? `${labelForKind(kind)} Mock 可用。` : "尚未测试连接。";
  const status =
    setting?.lastTestStatus ??
    (emailMisconfigured || emailUnconfigured ? "failed" : provider === "mock" ? "success" : "untested");
  const staleMockMessage = kind === "email" && provider === "smtp" && setting?.lastTestMessage?.includes("mock provider");
  const lastTestMessage = staleMockMessage ? undefined : setting?.lastTestMessage;
  return {
    kind,
    provider,
    source: emailConfigured ? "file" : emailPartialFileConfig ? "unconfigured" : envProvider === "mock" ? "mock" : emailMisconfigured ? "unconfigured" : "env",
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
    secretConfigured: kind === "email" ? Boolean(setting?.secret || process.env.SMTP_URL) : false,
    secretPreview: kind === "email" ? setting?.secretPreview ?? (process.env.SMTP_URL ? maskSecret(process.env.SMTP_URL) : undefined) : undefined,
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
  resetLocalSettingsForTests();
}
