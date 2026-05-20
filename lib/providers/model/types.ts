import type { ChatMessage, DigestPreview, NewsArticle, Quote, WatchlistItem } from "@/lib/domain/types";

export type DigestPrompt = {
  watchlist: WatchlistItem[];
  quotes: Quote[];
  articles: NewsArticle[];
};

export type ChatRequest = {
  question: string;
  watchlist: WatchlistItem[];
  quotes: Quote[];
  articles: NewsArticle[];
  history?: ChatMessage[];
};

export type ChatChunk = {
  content: string;
};

export interface ModelProvider {
  streamChat(input: ChatRequest): AsyncIterable<ChatChunk>;
  generateDigest(input: DigestPrompt): Promise<DigestPreview>;
}
