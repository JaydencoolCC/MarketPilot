import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/domain/errors";

export function assertJobRequestAuthorized(request: Request) {
  const configuredPassword = process.env.APP_PASSWORD?.trim();
  if (!configuredPassword) {
    throw new AppError("VALIDATION_ERROR", "缺少 APP_PASSWORD，不能执行后台任务。", 500);
  }

  const providedPassword =
    bearerToken(request.headers.get("authorization")) ??
    request.headers.get("x-app-password") ??
    "";

  if (!safeEqual(providedPassword, configuredPassword)) {
    throw new AppError("UNAUTHORIZED_PROVIDER", "后台任务认证失败。", 401);
  }
}

function bearerToken(value: string | null) {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
