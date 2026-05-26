import type { GoldHistory, GoldRange, GoldScope } from "@/lib/domain/types";

export interface GoldProvider {
  getHistory(input: { scope: GoldScope; range: GoldRange }): Promise<GoldHistory>;
}
