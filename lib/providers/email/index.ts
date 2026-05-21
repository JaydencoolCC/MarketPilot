import { AppError } from "@/lib/domain/errors";
import { resolveEmailProviderConfig } from "@/lib/db/store";
import { MockEmailProvider } from "@/lib/providers/email/mock";
import { SmtpEmailProvider } from "@/lib/providers/email/smtp";
import type { DigestEmail, EmailProvider, EmailSendResult } from "@/lib/providers/email/types";

class UnimplementedEmailProvider implements EmailProvider {
  async sendDigest(_input: DigestEmail): Promise<EmailSendResult> {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "真实邮件未配置，请填写 SMTP 授权码并保存邮件连接。",
      503,
    );
  }
}

export async function getEmailProvider(): Promise<EmailProvider> {
  const config = await resolveEmailProviderConfig();
  if (config.provider === "smtp" && config.smtpUrl && config.from) {
    return new SmtpEmailProvider({
      smtpUrl: config.smtpUrl,
      from: config.from,
    });
  }

  if (process.env.NODE_ENV === "test" && process.env.EMAIL_PROVIDER === "mock") {
    return new MockEmailProvider();
  }

  return new UnimplementedEmailProvider();
}
