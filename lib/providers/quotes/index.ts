import { AppError } from "@/lib/domain/errors";
import type { Market, Quote, Security } from "@/lib/domain/types";
import { AutoQuoteProvider } from "@/lib/providers/quotes/auto";
import { LongbridgeQuoteProvider } from "@/lib/providers/quotes/longbridge";
import { MockQuoteProvider } from "@/lib/providers/quotes/mock";
import { SinaQuoteProvider } from "@/lib/providers/quotes/sina";
import { YahooQuoteProvider } from "@/lib/providers/quotes/yahoo";
import type { QuoteProvider } from "@/lib/providers/quotes/types";

class UnimplementedQuoteProvider implements QuoteProvider {
  async getQuotes(): Promise<Quote[]> {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "真实行情 provider 尚未接入，请配置 QUOTE_PROVIDER=auto、sina、yahoo 或 longbridge。",
      503,
    );
  }

  async searchSymbols(_keyword: string, _market?: Market): Promise<Security[]> {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "真实行情 provider 尚未接入，请配置 QUOTE_PROVIDER=auto、sina、yahoo 或 longbridge。",
      503,
    );
  }
}

export function getQuoteProvider(): QuoteProvider {
  const configuredProvider = process.env.QUOTE_PROVIDER ?? "auto";
  const provider =
    configuredProvider === "mock" && process.env.NODE_ENV !== "test" ? "auto" : configuredProvider;
  if (provider === "auto") {
    return new AutoQuoteProvider();
  }

  if (provider === "mock") {
    return new MockQuoteProvider();
  }

  if (provider === "yahoo") {
    return new YahooQuoteProvider();
  }

  if (provider === "sina") {
    return new SinaQuoteProvider();
  }

  if (provider === "longbridge" || provider === "longport") {
    return new LongbridgeQuoteProvider();
  }

  return new UnimplementedQuoteProvider();
}
