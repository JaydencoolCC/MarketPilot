import { AppError } from "@/lib/domain/errors";
import type { DigestPreview, EmailDigestSetting } from "@/lib/domain/types";
import {
  createNewsDigest,
  findNewsDigest,
  finishJobRun,
  getEmailSetting,
  getWatchlistItems,
  markNewsDigestEmailStatus,
  refreshQuotes,
  saveNewsArticles,
  startJobRun,
} from "@/lib/db/store";
import { getEmailProvider } from "@/lib/providers/email";
import { getModelProvider } from "@/lib/providers/model";
import { getNewsProvider } from "@/lib/providers/news";

export type DigestBuildResult = {
  setting: EmailDigestSetting;
  digest: DigestPreview;
  articleIds: string[];
};

export type DailyDigestSendResult = {
  status: "sent" | "skipped";
  message: string;
  digest: DigestPreview;
};

export type DailyDigestJobResult = {
  status: "sent" | "skipped" | "failed";
  message: string;
  digest?: DigestPreview;
  jobRunId: string;
};

export async function buildDigestPreview(): Promise<DigestBuildResult> {
  const setting = await getEmailSetting();
  const watchlist = await getWatchlistItems();
  const symbols = watchlist.map((item) => item.normalizedSymbol);
  const quotes = await refreshQuotes(symbols);
  const articles = await saveNewsArticles(
    await getNewsProvider().fetchMarketNews({
      symbols,
      markets: setting.markets,
      hours: 24,
    }),
  );
  let digest: DigestPreview;
  try {
    digest = await (await getModelProvider()).generateDigest({ watchlist, quotes, articles });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "PROVIDER_UNAVAILABLE") {
      throw error;
    }
    digest = buildBasicDigest({ watchlist, quotes, articles });
  }

  return {
    setting,
    digest,
    articleIds: articles.map((article) => article.id),
  };
}

function buildBasicDigest({
  watchlist,
  quotes,
  articles,
}: {
  watchlist: Awaited<ReturnType<typeof getWatchlistItems>>;
  quotes: Awaited<ReturnType<typeof refreshQuotes>>;
  articles: Awaited<ReturnType<typeof saveNewsArticles>>;
}): DigestPreview {
  const topArticles = articles.slice(0, 3);
  const quoteLines = watchlist.slice(0, 6).map((item) => {
    const quote = quotes.find((entry) => entry.symbol === item.normalizedSymbol);
    if (!quote) return `${item.name}（${item.normalizedSymbol}）：暂无最新行情。`;
    return `${item.name}（${item.normalizedSymbol}）：${quote.price} ${quote.currency}，涨跌幅 ${quote.changePercent.toFixed(2)}%，行情时间 ${new Date(quote.quoteTime).toLocaleString("zh-CN")}。`;
  });

  return {
    title: "今日重点财经摘要",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        heading: "市场重点",
        body: topArticles.length
          ? topArticles.map((article) => article.summary || article.title).join(" ")
          : "过去 24 小时没有找到与当前关注市场高度相关的重要新闻。",
        sources: topArticles.map((article) => ({ title: article.title, url: article.url })),
      },
      {
        heading: "自选股变化",
        body: quoteLines.length ? quoteLines.join(" ") : "还没有自选股，暂时无法整理个股变化。",
      },
      {
        heading: "说明",
        body: "当前模型配置不可用，本邮件使用行情和新闻数据生成基础摘要。",
      },
    ],
  };
}

export async function sendDailyDigest(options: { force?: boolean } = {}) {
  const setting = await getEmailSetting();
  const recipientEmail = setting.recipientEmail.trim();

  if (!setting.enabled) {
    throw new AppError("VALIDATION_ERROR", "每日邮件尚未启用。", 400);
  }

  if (!recipientEmail) {
    throw new AppError("VALIDATION_ERROR", "请先配置收件邮箱。", 400);
  }

  const date = digestDateForTimezone(new Date(), setting.timezone);
  const existing = await findNewsDigest({ date, recipientEmail });

  if (existing?.emailStatus === "sent" && !options.force) {
    return {
      status: "skipped",
      message: "今天的每日摘要已经发送过，不会重复发送。",
      digest: parseDigestContent(existing.content),
    } satisfies DailyDigestSendResult;
  }

  const built = existing
    ? {
        setting,
        digest: parseDigestContent(existing.content),
        articleIds: existing.articleIds,
      }
    : await buildDigestPreview();

  const digestRecord =
    existing ??
    (await createNewsDigest({
      date,
      recipientEmail,
      title: built.digest.title,
      content: JSON.stringify(built.digest),
      articleIds: built.articleIds,
    }));

  try {
    const result = await (await getEmailProvider()).sendDigest({
      setting: {
        ...built.setting,
        recipientEmail,
      },
      digest: built.digest,
    });
    await markNewsDigestEmailStatus(digestRecord.id, "sent");
    return {
      status: "sent",
      message: result.message,
      digest: built.digest,
    } satisfies DailyDigestSendResult;
  } catch (error) {
    await markNewsDigestEmailStatus(digestRecord.id, "failed");
    throw error;
  }
}

export async function runDailyDigestJob(now = new Date()): Promise<DailyDigestJobResult> {
  const jobRun = await startJobRun("daily-digest");

  try {
    const setting = await getEmailSetting();
    const due = isDailyDigestDue(setting, now);

    if (!due.due) {
      await finishJobRun(jobRun.id, "success");
      return {
        status: "skipped",
        message: due.message,
        jobRunId: jobRun.id,
      };
    }

    const result = await sendDailyDigest();
    await finishJobRun(jobRun.id, "success");
    return {
      ...result,
      jobRunId: jobRun.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "每日摘要任务失败。";
    const code = error instanceof AppError ? error.code : "UNKNOWN_ERROR";
    await finishJobRun(jobRun.id, "failed", { code, message });
    return {
      status: "failed",
      message,
      jobRunId: jobRun.id,
    };
  }
}

export function isDailyDigestDue(setting: EmailDigestSetting, now = new Date()) {
  if (!setting.enabled) {
    return { due: false, message: "每日邮件尚未启用。" };
  }

  if (!setting.recipientEmail.trim()) {
    return { due: false, message: "每日邮件缺少收件邮箱。" };
  }

  const current = timePartsForTimezone(now, setting.timezone);
  const [sendHourText, sendMinuteText] = setting.sendTime.split(":");
  const sendHour = Number(sendHourText);
  const sendMinute = Number(sendMinuteText);

  if (!Number.isInteger(sendHour) || !Number.isInteger(sendMinute)) {
    return { due: false, message: "每日邮件发送时间格式不正确。" };
  }

  const currentMinutes = current.hour * 60 + current.minute;
  const sendMinutes = sendHour * 60 + sendMinute;

  if (currentMinutes < sendMinutes) {
    return {
      due: false,
      message: `还没到今天的发送时间 ${setting.sendTime}（${setting.timezone}）。`,
    };
  }

  return { due: true, message: "已到每日摘要发送时间。" };
}

function digestDateForTimezone(date: Date, timezone: string) {
  const { year, month, day } = timePartsForTimezone(date, timezone);

  if (!year || !month || !day) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function timePartsForTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(partMap.get("year")),
    month: Number(partMap.get("month")),
    day: Number(partMap.get("day")),
    hour: Number(partMap.get("hour")) % 24,
    minute: Number(partMap.get("minute")),
  };
}

function parseDigestContent(content: string): DigestPreview {
  try {
    const parsed = JSON.parse(content) as DigestPreview;
    if (parsed.title && parsed.generatedAt && Array.isArray(parsed.sections)) {
      return parsed;
    }
  } catch {
    // Fall through to a readable fallback rather than failing idempotency checks.
  }

  return {
    title: "今日重点财经摘要",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        heading: "摘要记录",
        body: content || "今天的摘要已经生成，但内容格式需要重新生成后查看。",
      },
    ],
  };
}
