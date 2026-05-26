import { AppError } from "@/lib/domain/errors";
import type { GoldHistory, GoldRange, GoldScope } from "@/lib/domain/types";
import { PublicGoldProvider } from "@/lib/providers/gold/public";
import type { GoldProvider } from "@/lib/providers/gold/types";

class UnimplementedGoldProvider implements GoldProvider {
  async getHistory(_input: { scope: GoldScope; range: GoldRange }): Promise<GoldHistory> {
    throw new AppError("PROVIDER_UNAVAILABLE", "真实黄金 provider 尚未接入，请配置 GOLD_PROVIDER=public。", 503);
  }
}

export function getGoldProvider(): GoldProvider {
  const provider = process.env.GOLD_PROVIDER ?? "public";
  if (provider === "public") {
    return new PublicGoldProvider();
  }
  return new UnimplementedGoldProvider();
}
