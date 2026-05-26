import { AppError } from "@/lib/domain/errors";
import type { FundHolding, FundSearchResult, FundSnapshot } from "@/lib/domain/types";
import { PublicFundProvider } from "@/lib/providers/funds/public";
import type { FundProvider } from "@/lib/providers/funds/types";

class UnimplementedFundProvider implements FundProvider {
  async searchFunds(): Promise<FundSearchResult[]> {
    throw new AppError("PROVIDER_UNAVAILABLE", "真实基金 provider 尚未接入，请配置 FUND_PROVIDER=public。", 503);
  }

  async getFundSnapshots(): Promise<FundSnapshot[]> {
    throw new AppError("PROVIDER_UNAVAILABLE", "真实基金 provider 尚未接入，请配置 FUND_PROVIDER=public。", 503);
  }

  async getFundHoldings(): Promise<FundHolding[]> {
    throw new AppError("PROVIDER_UNAVAILABLE", "真实基金 provider 尚未接入，请配置 FUND_PROVIDER=public。", 503);
  }
}

export function getFundProvider(): FundProvider {
  const provider = process.env.FUND_PROVIDER ?? "public";
  if (provider === "public") {
    return new PublicFundProvider();
  }
  return new UnimplementedFundProvider();
}
