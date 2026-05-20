export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAUTHORIZED_PROVIDER"
  | "UNKNOWN_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  if (error instanceof Error && error.name === "ZodError") {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数不完整或格式不正确。",
        },
      },
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        error: {
          code: "UNKNOWN_ERROR",
          message: error.message,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "UNKNOWN_ERROR",
        message: "未知错误",
      },
    },
  };
}
