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
      update: (args: unknown) => Promise<WatchlistRecord>;
      delete: (args: unknown) => Promise<WatchlistRecord>;
    };
    quoteSnapshot: {
      findMany: (args?: unknown) => Promise<QuoteSnapshotRecord[]>;
      create: (args: unknown) => unknown;
      update: (args: unknown) => unknown;
    };
    fundWatchlistItem: {
      findMany: (args?: unknown) => Promise<FundWatchlistRecord[]>;
      findUnique: (args: unknown) => Promise<FundWatchlistRecord | null>;
      create: (args: unknown) => Promise<FundWatchlistRecord>;
      update: (args: unknown) => Promise<FundWatchlistRecord>;
      delete: (args: unknown) => Promise<FundWatchlistRecord>;
    };
    fundSnapshot: {
      findMany: (args?: unknown) => Promise<FundSnapshotRecord[]>;
      create: (args: unknown) => unknown;
      update: (args: unknown) => unknown;
    };
    $transaction: <T>(queries: T[]) => Promise<T[]>;
  };
}

export type WatchlistRecord = {
  id: string;
  symbol: string;
  normalizedSymbol: string;
  market: "US" | "HK" | "CN" | "JP";
  name: string;
  currency: string;
  costPrice: unknown | null;
  shares: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

export type QuoteSnapshotRecord = {
  id: string;
  symbol: string;
  price: unknown;
  change: unknown;
  changePercent: unknown;
  currency: string;
  marketStatus: string;
  provider: string;
  quoteTime: Date;
  createdAt?: Date;
  updatedAt?: Date;
  errorCode: string | null;
  errorMessage: string | null;
};

export type FundWatchlistRecord = {
  id: string;
  code: string;
  normalizedSymbol: string;
  type: string;
  market: "US" | "HK" | "CN" | "JP" | null;
  name: string;
  currency: string;
  costPrice: unknown | null;
  shares: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FundSnapshotRecord = {
  id: string;
  symbol: string;
  netValue: unknown;
  estimateValue: unknown | null;
  changePercent: unknown;
  currency: string;
  provider: string;
  quoteTime: Date;
  createdAt?: Date;
  errorCode: string | null;
  errorMessage: string | null;
};
