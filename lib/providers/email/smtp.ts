import nodemailer from "nodemailer";
import { AppError } from "@/lib/domain/errors";
import type { DigestPreview } from "@/lib/domain/types";
import type { DigestEmail, EmailProvider, EmailSendResult } from "@/lib/providers/email/types";

export class SmtpEmailProvider implements EmailProvider {
  async sendDigest(input: DigestEmail): Promise<EmailSendResult> {
    const smtpUrl = process.env.SMTP_URL;
    const from = process.env.EMAIL_FROM;

    if (!smtpUrl || !from) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "SMTP 配置不完整，请设置 SMTP_URL 和 EMAIL_FROM。",
        503,
      );
    }

    const recipient = input.setting.recipientEmail?.trim();
    if (!recipient) {
      throw new AppError("VALIDATION_ERROR", "请先配置收件邮箱。", 400);
    }

    const transporter = nodemailer.createTransport(smtpUrl);
    const subject = input.test ? `[测试] ${input.digest.title}` : input.digest.title;
    const result = await transporter.sendMail({
      from,
      to: recipient,
      subject,
      text: digestToText(input.digest),
      html: digestToHtml(input.digest),
    });

    return {
      id: result.messageId,
      status: "sent",
      message: input.test ? "测试邮件已发送。" : "每日摘要邮件已发送。",
    };
  }
}

function digestToText(digest: DigestPreview) {
  const lines = [digest.title, `生成时间：${new Date(digest.generatedAt).toLocaleString("zh-CN")}`];

  for (const section of digest.sections) {
    lines.push("", section.heading, section.body);
    for (const source of section.sources ?? []) {
      lines.push(`来源：${source.title} ${source.url}`);
    }
  }

  return lines.join("\n");
}

function digestToHtml(digest: DigestPreview) {
  const sections = digest.sections
    .map((section) => {
      const sources = (section.sources ?? [])
        .map(
          (source) =>
            `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a></li>`,
        )
        .join("");

      return `
        <section style="margin:24px 0;">
          <h2 style="font-size:18px;line-height:1.4;margin:0 0 8px;color:#10231f;">${escapeHtml(
            section.heading,
          )}</h2>
          <p style="font-size:14px;line-height:1.8;margin:0;color:#38433f;">${escapeHtml(
            section.body,
          )}</p>
          ${sources ? `<ul style="font-size:13px;line-height:1.7;color:#5c6762;">${sources}</ul>` : ""}
        </section>
      `;
    })
    .join("");

  return `
    <main style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#fbfbf8;">
      <h1 style="font-size:24px;line-height:1.3;margin:0;color:#10231f;">${escapeHtml(
        digest.title,
      )}</h1>
      <p style="font-size:13px;color:#68736e;">生成时间：${escapeHtml(
        new Date(digest.generatedAt).toLocaleString("zh-CN"),
      )}</p>
      ${sections}
    </main>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
