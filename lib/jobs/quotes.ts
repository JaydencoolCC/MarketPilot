import { AppError } from "@/lib/domain/errors";
import {
  finishJobRun,
  getWatchlistItems,
  refreshQuotes,
  startJobRun,
} from "@/lib/db/store";

export type RefreshQuotesJobResult = {
  status: "success" | "failed";
  message: string;
  refreshedCount: number;
  jobRunId: string;
};

export async function runRefreshQuotesJob(): Promise<RefreshQuotesJobResult> {
  const jobRun = await startJobRun("refresh-quotes");

  try {
    const watchlist = await getWatchlistItems();
    const symbols = watchlist.map((item) => item.normalizedSymbol);

    if (!symbols.length) {
      await finishJobRun(jobRun.id, "success");
      return {
        status: "success",
        message: "没有自选股，跳过行情刷新。",
        refreshedCount: 0,
        jobRunId: jobRun.id,
      };
    }

    const quotes = await refreshQuotes(symbols);
    await finishJobRun(jobRun.id, "success");
    return {
      status: "success",
      message: `已刷新 ${quotes.length} 条行情快照。`,
      refreshedCount: quotes.length,
      jobRunId: jobRun.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "行情刷新任务失败。";
    const code = error instanceof AppError ? error.code : "UNKNOWN_ERROR";
    await finishJobRun(jobRun.id, "failed", { code, message });
    return {
      status: "failed",
      message,
      refreshedCount: 0,
      jobRunId: jobRun.id,
    };
  }
}
