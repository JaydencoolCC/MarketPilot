export type Market = "US" | "HK" | "CN" | "JP";

export type DataStatus = "ok" | "stale" | "error";

export type MarketStatus = "open" | "closed" | "pre_market" | "after_hours" | "unknown";

export type WatchlistItem = {
  id: string;
  symbol: string;
  normalizedSymbol: string;
  market: Market;
  name: string;
  currency: string;
  costPrice?: number;
  shares?: number;
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

export type FundType = "mutual_fund" | "etf";

export type FundItem = {
  id: string;
  code: string;
  normalizedSymbol: string;
  type: FundType;
  market?: Market;
  name: string;
  currency: string;
  costPrice?: number;
  shares?: number;
  createdAt: string;
  updatedAt: string;
};

export type FundSnapshot = {
  symbol: string;
  netValue: number;
  changePercent: number;
  estimateValue?: number;
  currency: string;
  provider: string;
  quoteTime: string;
  fetchedAt?: string;
  status: DataStatus;
  errorCode?: string;
  errorMessage?: string;
};

export type FundRow = FundItem & {
  snapshot: FundSnapshot | null;
  dataStatus: DataStatus;
};

export type FundSearchResult = {
  code: string;
  normalizedSymbol: string;
  type: FundType;
  market?: Market;
  name: string;
  currency: string;
};

export type FundHolding = {
  rank: number;
  symbol: string;
  name: string;
  weightPercent: number;
  shares?: number;
  marketValue?: number;
  asOfDate?: string;
  provider: string;
};

export type GoldScope = "international" | "domestic";

export type GoldRange = "1d" | "1m" | "3m" | "6m" | "1y";

export type GoldPoint = {
  date: string;
  price: number;
};

export type GoldHistory = {
  scope: GoldScope;
  range: GoldRange;
  currency: string;
  unit: string;
  provider: string;
  updatedAt: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  points: GoldPoint[];
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
  secret?: string;
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
  source: "file" | "env" | "mock" | "unconfigured";
  label: string;
  description: string;
  status: IntegrationTestStatus;
  statusMessage: string;
  baseUrl?: string;
  modelName?: string;
  secretConfigured: boolean;
  secretPreview?: string;
  lastTestedAt?: string;
};

export type MarketDataNetworkSetting = {
  proxyUrl?: string;
};
