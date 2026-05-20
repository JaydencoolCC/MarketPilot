import { AppError } from "@/lib/domain/errors";
import { MockEmailProvider } from "@/lib/providers/email/mock";
import { SmtpEmailProvider } from "@/lib/providers/email/smtp";
import type { DigestEmail, EmailProvider, EmailSendResult } from "@/lib/providers/email/types";

class UnimplementedEmailProvider implements EmailProvider {
  async sendDigest(_input: DigestEmail): Promise<EmailSendResult> {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "真实邮件 provider 尚未接入，请先使用 EMAIL_PROVIDER=mock。",
      503,
    );
  }
}

export function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? "mock";
  if (provider === "mock") {
    return new MockEmailProvider();
  }

  if (provider === "smtp") {
    return new SmtpEmailProvider();
  }

  return new UnimplementedEmailProvider();
}
