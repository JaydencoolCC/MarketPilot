import type { ChatRuntimeContext } from "@/lib/providers/model/types";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

export function createChatRuntimeContext(now = new Date()): ChatRuntimeContext {
  const timezone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? "";

  return {
    now: now.toISOString(),
    timezone,
    today: `${part("year")}-${part("month")}-${part("day")}`,
    localTime: new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now),
  };
}
