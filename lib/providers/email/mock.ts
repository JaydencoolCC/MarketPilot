import type { EmailProvider, DigestEmail, EmailSendResult } from "@/lib/providers/email/types";

export class MockEmailProvider implements EmailProvider {
  async sendDigest(input: DigestEmail): Promise<EmailSendResult> {
    return {
      id: `mock-email-${Date.now()}`,
      status: "mocked",
      message: input.test
        ? "测试邮件已在 mock provider 中模拟发送。"
        : "每日摘要已在 mock provider 中模拟发送。",
    };
  }

  async verifyConnection(): Promise<string> {
    return "测试环境中的 mock 邮件 provider 可用。";
  }
}
