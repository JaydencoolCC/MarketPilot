import nodemailer from "nodemailer";
import { AppError } from "@/lib/domain/errors";
import type { DigestPreview } from "@/lib/domain/types";
import type { DigestEmail, EmailProvider, EmailSendResult } from "@/lib/providers/email/types";

export class SmtpEmailProvider implements EmailProvider {
  constructor(private readonly config?: { smtpUrl: string; from: string }) {}

  async sendDigest(input: DigestEmail): Promise<EmailSendResult> {
    const { smtpUrl, from } = this.getConfig();

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

  async verifyConnection(): Promise<string> {
    const { smtpUrl } = this.getConfig();
    const transporter = nodemailer.createTransport(smtpUrl);
    await transporter.verify();
    return "SMTP 连接正常。";
  }

  private getConfig() {
    const smtpUrl = this.config?.smtpUrl ?? process.env.SMTP_URL;
    const from = this.config?.from ?? process.env.EMAIL_FROM;

    if (!smtpUrl || !from) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "SMTP 配置不完整，请设置 SMTP_URL 和 EMAIL_FROM。",
        503,
      );
    }

    return { smtpUrl, from };
  }
}

export function digestToText(digest: DigestPreview) {
  const lines = [digest.title, `生成时间：${new Date(digest.generatedAt).toLocaleString("zh-CN")}`];

  for (const section of digest.sections) {
    lines.push("", section.heading, section.body);
    for (const source of section.sources ?? []) {
      lines.push(`来源：${source.title} ${source.url}`);
    }
  }

  return lines.join("\n");
}

export function digestToHtml(digest: DigestPreview) {
  const sections = digest.sections
    .map((section) => {
      const sources = (section.sources ?? [])
        .map(
          (source) =>
            `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a></li>`,
        )
        .join("");

      return `
        <section style="margin:20px 0;padding:18px 20px;border:1px solid #e4e7e2;border-radius:8px;background:#ffffff;">
          <h2 style="font-size:18px;line-height:1.4;margin:0 0 12px;color:#10231f;">${escapeHtml(
            section.heading,
          )}</h2>
          ${renderBodyHtml(section.body)}
          ${sources ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #edf0eb;"><div style="font-size:12px;color:#7a8580;margin-bottom:6px;">来源</div><ul style="font-size:13px;line-height:1.7;color:#5c6762;margin:0;padding-left:18px;">${sources}</ul></div>` : ""}
        </section>
      `;
    })
    .join("");

  return `
    <main style="margin:0;padding:0;background:#f6f7f4;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:28px 18px;">
        <header style="margin:0 0 18px;">
          <h1 style="font-size:24px;line-height:1.3;margin:0;color:#10231f;">${escapeHtml(
            digest.title,
          )}</h1>
          <p style="font-size:13px;line-height:1.6;margin:8px 0 0;color:#68736e;">生成时间：${escapeHtml(
            new Date(digest.generatedAt).toLocaleString("zh-CN"),
          )}</p>
        </header>
        ${sections}
      </div>
    </main>
  `;
}

function renderBodyHtml(body: string) {
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";

    if (!line) {
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const { html: tableHtml, nextIndex } = renderTable(lines, index);
      html.push(tableHtml);
      index = nextIndex;
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      html.push(
        `<h3 style="font-size:15px;line-height:1.5;margin:16px 0 8px;color:#20332e;">${renderInline(
          heading[1],
        )}</h3>`,
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trim() ?? "")) {
        items.push((lines[index]?.trim() ?? "").replace(/^[-*]\s+/, ""));
        index += 1;
      }
      html.push(
        `<ul style="font-size:14px;line-height:1.8;margin:8px 0 0;padding-left:20px;color:#38433f;">${items
          .map((item) => `<li style="margin:2px 0;">${renderInline(item)}</li>`)
          .join("")}</ul>`,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index]?.trim() ?? "";
      if (
        !current ||
        /^#{1,4}\s+/.test(current) ||
        /^[-*]\s+/.test(current) ||
        isMarkdownTableStart(lines, index)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }

    if (paragraph.length > 0) {
      html.push(
        `<p style="font-size:14px;line-height:1.85;margin:8px 0 0;color:#38433f;">${paragraph
          .map(renderInline)
          .join("<br>")}</p>`,
      );
    }
  }

  return html.join("");
}

function isMarkdownTableStart(lines: string[], index: number) {
  const header = lines[index]?.trim() ?? "";
  const divider = lines[index + 1]?.trim() ?? "";
  return isTableRow(header) && isMarkdownTableDivider(divider);
}

function isTableRow(line: string) {
  return line.startsWith("|") && line.endsWith("|") && line.split("|").length >= 4;
}

function isMarkdownTableDivider(line: string) {
  if (!isTableRow(line)) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderTable(lines: string[], index: number) {
  const rows: string[][] = [splitTableRow(lines[index] ?? "")];
  let nextIndex = index + 2;

  while (nextIndex < lines.length && isTableRow(lines[nextIndex]?.trim() ?? "")) {
    rows.push(splitTableRow(lines[nextIndex] ?? ""));
    nextIndex += 1;
  }

  const [header, ...bodyRows] = rows;
  const headerHtml = header
    .map(
      (cell) =>
        `<th style="font-size:12px;line-height:1.5;text-align:left;padding:8px 10px;border-bottom:1px solid #dfe4dd;color:#53605b;background:#f2f5f0;">${renderInline(
          cell,
        )}</th>`,
    )
    .join("");
  const rowsHtml = bodyRows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td style="font-size:13px;line-height:1.6;padding:8px 10px;border-bottom:1px solid #edf0eb;color:#38433f;">${renderInline(
                cell,
              )}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return {
    html: `<table style="width:100%;border-collapse:collapse;margin:10px 0 2px;background:#ffffff;border:1px solid #e4e7e2;"> <thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`,
    nextIndex,
  };
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(value: string) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
