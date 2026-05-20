const globalForPrisma = globalThis as typeof globalThis & {
  tradePrisma?: unknown;
};

export function shouldUseDatabase() {
  return Boolean(process.env.DATABASE_URL) && process.env.NODE_ENV !== "test";
}

export async function getPrisma() {
  if (!globalForPrisma.tradePrisma) {
    const [{ PrismaPg }, prismaClientModule] = await Promise.all([
      import("@prisma/adapter-pg") as Promise<{
        PrismaPg: new (config: { connectionString: string }) => unknown;
      }>,
      import("@prisma/client") as Promise<{
        PrismaClient: new (config?: { adapter?: unknown }) => unknown;
      }>,
    ]);
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when database mode is enabled.");
    }
    const adapter = new PrismaPg({ connectionString });
    globalForPrisma.tradePrisma = new prismaClientModule.PrismaClient({ adapter });
  }

  return globalForPrisma.tradePrisma as {
    watchlistItem: {
      findMany: (args?: unknown) => Promise<WatchlistRecord[]>;
      findUnique: (args: unknown) => Promise<WatchlistRecord | null>;
      create: (args: unknown) => Promise<WatchlistRecord>;
      delete: (args: unknown) => Promise<WatchlistRecord>;
    };
    quoteSnapshot: {
      findMany: (args?: unknown) => Promise<QuoteSnapshotRecord[]>;
      create: (args: unknown) => unknown;
    };
    newsArticle: {
      upsert: (args: unknown) => unknown;
    };
    newsDigest: {
      findUnique: (args: unknown) => Promise<NewsDigestRecord | null>;
      create: (args: unknown) => Promise<NewsDigestRecord>;
      update: (args: unknown) => Promise<NewsDigestRecord>;
    };
    jobRun: {
      create: (args: unknown) => Promise<JobRunRecord>;
      update: (args: unknown) => Promise<JobRunRecord>;
    };
    chatSession: {
      findFirst: (args?: unknown) => Promise<ChatSessionRecord | null>;
      create: (args: unknown) => Promise<ChatSessionRecord>;
    };
    chatMessage: {
      create: (args: unknown) => Promise<ChatMessageRecord>;
      findMany: (args?: unknown) => Promise<ChatMessageRecord[]>;
    };
    emailDigestSetting: {
      findFirst: (args?: unknown) => Promise<EmailDigestSettingRecord | null>;
      create: (args: unknown) => Promise<EmailDigestSettingRecord>;
      update: (args: unknown) => Promise<EmailDigestSettingRecord>;
    };
    integrationSetting: {
      findMany: (args?: unknown) => Promise<IntegrationSettingRecord[]>;
      findUnique: (args: unknown) => Promise<IntegrationSettingRecord | null>;
      upsert: (args: unknown) => Promise<IntegrationSettingRecord>;
      update: (args: unknown) => Promise<IntegrationSettingRecord>;
    };
    $transaction: <T>(queries: T[]) => Promise<T[]>;
  };
}

export type WatchlistRecord = {
  id: string;
  symbol: string;
  normalizedSymbol: string;
  market: "US" | "HK" | "CN";
  name: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

export type QuoteSnapshotRecord = {
  symbol: string;
  price: unknown;
  change: unknown;
  changePercent: unknown;
  currency: string;
  marketStatus: string;
  provider: string;
  quoteTime: Date;
  createdAt?: Date;
  errorCode: string | null;
  errorMessage: string | null;
};

export type EmailDigestSettingRecord = {
  id: string;
  enabled: boolean;
  recipientEmail: string;
  sendTime: string;
  timezone: string;
  markets: Array<"US" | "HK" | "CN">;
  watchlistOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NewsDigestRecord = {
  id: string;
  date: Date;
  recipientEmail: string;
  title: string;
  content: string;
  articleIds: string[];
  emailStatus: "draft" | "sent" | "failed";
  sentAt: Date | null;
  createdAt: Date;
};

export type JobRunRecord = {
  id: string;
  jobType: string;
  status: "pending" | "running" | "success" | "failed";
  startedAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ChatSessionRecord = {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessageRecord = {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
};

export type IntegrationSettingRecord = {
  id: string;
  kind: string;
  provider: string;
  baseUrl: string | null;
  modelName: string | null;
  encryptedSecret: string | null;
  secretPreview: string | null;
  lastTestStatus: string;
  lastTestMessage: string | null;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
