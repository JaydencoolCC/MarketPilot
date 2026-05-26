import { AppError } from "@/lib/domain/errors";
import { listFundRows, refreshFunds } from "@/lib/db/store";

export type RefreshFundsJobResult = {
  status: "success" | "skipped" | "failed";
  message: string;
  refreshed: number;
};

export async function runRefreshFundsJob(): Promise<RefreshFundsJobResult> {
  try {
    const funds = await listFundRows();
    if (!funds.length) {
      return {
        status: "skipped",
        message: "还没有自选基金，跳过刷新。",
        refreshed: 0,
      };
    }

    const snapshots = await refreshFunds(funds.map((fund) => fund.normalizedSymbol));
    const failed = snapshots.filter((snapshot) => snapshot.status === "error");
    if (failed.length === snapshots.length) {
      throw new AppError("PROVIDER_UNAVAILABLE", "所有基金数据刷新失败。", 503);
    }

    return {
      status: failed.length ? "failed" : "success",
      message: failed.length ? `${failed.length} 只基金刷新失败。` : "基金数据已刷新。",
      refreshed: snapshots.length - failed.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "基金刷新任务失败。";
    return {
      status: "failed",
      message,
      refreshed: 0,
    };
  }
}
