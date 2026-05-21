import { AppError } from "@/lib/domain/errors";
import type { NewsArticle } from "@/lib/domain/types";
import { AlphaVantageNewsProvider } from "@/lib/providers/news/alpha-vantage";
import { MockNewsProvider } from "@/lib/providers/news/mock";
import { PublicNewsProvider } from "@/lib/providers/news/public";
import type { NewsQuery } from "@/lib/providers/news/types";
import type { NewsProvider } from "@/lib/providers/news/types";

class UnimplementedNewsProvider implements NewsProvider {
  async fetchMarketNews(_input: NewsQuery): Promise<NewsArticle[]> {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "真实新闻 provider 尚未接入，请先使用 NEWS_PROVIDER=mock。",
      503,
    );
  }
}

export function getNewsProvider(): NewsProvider {
  const provider = process.env.NEWS_PROVIDER ?? "public";
  if (provider === "public") {
    return new PublicNewsProvider();
  }

  if (provider === "mock") {
    return new MockNewsProvider();
  }

  if (provider === "alpha-vantage") {
    return new AlphaVantageNewsProvider();
  }

  return new UnimplementedNewsProvider();
}
