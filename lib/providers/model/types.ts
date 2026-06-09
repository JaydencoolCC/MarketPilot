import type { ChatMessage, DigestPreview, NewsArticle, Quote, WatchlistItem } from "@/lib/domain/types";

export type DigestPrompt = {
  watchlist: WatchlistItem[];
  quotes: Quote[];
  indexQuotes: Quote[];
  articles: NewsArticle[];
};

export type ChatRequest = {
  question: string;
  watchlist: WatchlistItem[];
  quotes: Quote[];
  articles: NewsArticle[];
  context: ChatRuntimeContext;
  history?: ChatMessage[];
  signal?: AbortSignal;
};

export type ChatRuntimeContext = {
  now: string;
  timezone: string;
  today: string;
  localTime: string;
};

export type ChatChunk = {
  content: string;
};

export interface ModelProvider {
  streamChat(input: ChatRequest): AsyncIterable<ChatChunk>;
  generateDigest(input: DigestPrompt): Promise<DigestPreview>;
}
