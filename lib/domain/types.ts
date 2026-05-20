export type Market = "US" | "HK" | "CN";

export type DataStatus = "ok" | "stale" | "error";

export type MarketStatus = "open" | "closed" | "pre_market" | "after_hours";

export type WatchlistItem = {
  id: string;
  symbol: string;
  normalizedSymbol: string;
  market: Market;
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type Quote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketStatus: MarketStatus;
  provider: string;
  quoteTime: string;
  fetchedAt?: string;
  status: DataStatus;
  errorCode?: string;
  errorMessage?: string;
};

export type Security = {
  symbol: string;
  normalizedSymbol: string;
  market: Market;
  name: string;
  currency: string;
  aliases?: string[];
};

export type WatchlistRow = WatchlistItem & {
  quote: Quote | null;
  todayNewsCount: number;
  dataStatus: DataStatus;
};

export type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  symbols: string[];
  market: Market | "GLOBAL";
  publishedAt: string;
  importanceScore: number;
  createdAt: string;
};

export type EmailDigestSetting = {
  id: string;
  enabled: boolean;
  recipientEmail: string;
  sendTime: string;
  timezone: string;
  markets: Market[];
  watchlistOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DigestPreview = {
  title: string;
  generatedAt: string;
  sections: Array<{
    heading: string;
    body: string;
    sources?: Array<{ title: string; url: string }>;
  }>;
};

export type NewsDigestRecord = {
  id: string;
  date: string;
  recipientEmail: string;
  title: string;
  content: string;
  articleIds: string[];
  emailStatus: "draft" | "sent" | "failed";
  sentAt?: string;
  createdAt: string;
};

export type JobRunRecord = {
  id: string;
  jobType: string;
  status: "pending" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type IntegrationKind = "model" | "quote" | "news" | "email";

export type IntegrationTestStatus = "untested" | "success" | "failed";

export type IntegrationSetting = {
  id: string;
  kind: IntegrationKind;
  provider: string;
  baseUrl?: string;
  modelName?: string;
  encryptedSecret?: string;
  secretPreview?: string;
  lastTestStatus: IntegrationTestStatus;
  lastTestMessage?: string;
  lastTestedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicIntegrationSetting = {
  kind: IntegrationKind;
  provider: string;
  source: "database" | "env" | "mock" | "unconfigured";
  label: string;
  description: string;
  status: IntegrationTestStatus;
  statusMessage: string;
  baseUrl?: string;
  modelName?: string;
  secretConfigured: boolean;
  secretPreview?: string;
  encryptionConfigured: boolean;
  lastTestedAt?: string;
};
