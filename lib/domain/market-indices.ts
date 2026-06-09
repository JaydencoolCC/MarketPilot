import type { Quote } from "@/lib/domain/types";

export const DAILY_DIGEST_INDEX_SYMBOLS = [
  "000001.SH",
  "^GSPC",
  "^IXIC",
  "^NDX",
  "^DJI",
  "^N225",
  "^TOPX",
] as const;

const DAILY_DIGEST_INDEX_SYMBOL_SET = new Set<string>(DAILY_DIGEST_INDEX_SYMBOLS);

export function isDailyDigestIndexQuote(quote: Pick<Quote, "symbol">) {
  return DAILY_DIGEST_INDEX_SYMBOL_SET.has(quote.symbol);
}
