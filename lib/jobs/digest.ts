import { AppError } from "@/lib/domain/errors";
import type { DigestPreview, EmailDigestSetting } from "@/lib/domain/types";
import {
  getEmailSetting,
  getWatchlistItems,
  refreshQuotes,
} from "@/lib/db/store";
import { getEmailProvider } from "@/lib/providers/email";
import { getModelProvider } from "@/lib/providers/model";
import { getNewsProvider } from "@/lib/providers/news";
import {
  getLocalDigestRecord,
  saveLocalDigestRecord,
} from "@/lib/settings/local-digest-state";

export type DigestBuildResult = {
  setting: EmailDigestSetting;
  digest: DigestPreview;
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
};

export async function buildDigestPreview(): Promise<DigestBuildResult> {
  const setting = await getEmailSetting();
  const watchlist = await getWatchlistItems();
  const symbols = watchlist.map((item) => item.normalizedSymbol);
  const quotes = await refreshQuotes(symbols);
  const articles = await getNewsProvider().fetchMarketNews({
    symbols,
    markets: setting.markets,
    hours: 24,
  });
  const digest = await (await getModelProvider()).generateDigest({ watchlist, quotes, articles });

  return {
    setting,
    digest,
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
  const dateKey = date.toISOString();
  const existing = getLocalDigestRecord({ date: dateKey, recipientEmail });

  if (existing?.status === "sent" && !options.force) {
    return {
      status: "skipped",
      message: "今天的每日摘要已经发送过，不会重复发送。",
      digest: parseStoredDigest(existing),
    } satisfies DailyDigestSendResult;
  }

  const built = existing
    ? {
        setting,
        digest: parseStoredDigest(existing),
      }
    : await buildDigestPreview();

  const digestRecord =
    existing ??
    saveLocalDigestRecord({
      date: dateKey,
      recipientEmail,
      status: "draft",
      digest: built.digest,
      digestTitle: built.digest.title,
      generatedAt: built.digest.generatedAt,
    });

  try {
    const result = await (await getEmailProvider()).sendDigest({
      setting: {
        ...built.setting,
        recipientEmail,
      },
      digest: built.digest,
    });
    saveLocalDigestRecord({
      ...digestRecord,
      status: "sent",
      sentAt: new Date().toISOString(),
      digest: built.digest,
      digestTitle: built.digest.title,
      generatedAt: built.digest.generatedAt,
    });
    return {
      status: "sent",
      message: result.message,
      digest: built.digest,
    } satisfies DailyDigestSendResult;
  } catch (error) {
    saveLocalDigestRecord({
      ...digestRecord,
      status: "failed",
      digest: built.digest,
      digestTitle: built.digest.title,
      generatedAt: built.digest.generatedAt,
    });
    throw error;
  }
}

export async function runDailyDigestJob(now = new Date()): Promise<DailyDigestJobResult> {
  try {
    const setting = await getEmailSetting();
    const due = isDailyDigestDue(setting, now);

    if (!due.due) {
      return {
        status: "skipped",
        message: due.message,
      };
    }

    return await sendDailyDigest();
  } catch (error) {
    const message = error instanceof Error ? error.message : "每日摘要任务失败。";
    return {
      status: "failed",
      message,
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

function parseStoredDigest(record: {
  digest?: DigestPreview;
  digestTitle?: string;
  generatedAt?: string;
}) {
  if (record.digest) {
    return record.digest;
  }

  return {
    title: record.digestTitle ?? "今日重点财经摘要",
    generatedAt: record.generatedAt ?? new Date().toISOString(),
    sections: [
      {
        heading: "摘要记录",
        body: "今天的摘要已经发送，如需查看详情请重新生成预览。",
      },
    ],
  };
}
