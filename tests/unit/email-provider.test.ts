import { afterEach, describe, expect, it } from "vitest";
import { getEmailProvider } from "@/lib/providers/email";
import { digestToHtml, normalizeDigest } from "@/lib/providers/email/smtp";

const previousEnv = {
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  SMTP_URL: process.env.SMTP_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
};

afterEach(() => {
  restoreEnv("EMAIL_PROVIDER", previousEnv.EMAIL_PROVIDER);
  restoreEnv("SMTP_URL", previousEnv.SMTP_URL);
  restoreEnv("EMAIL_FROM", previousEnv.EMAIL_FROM);
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("email provider selection", () => {
  it("uses SMTP automatically when SMTP_URL is configured", async () => {
    delete process.env.EMAIL_PROVIDER;
    process.env.SMTP_URL = "smtp://user:pass@smtp.example.com:587";
    process.env.EMAIL_FROM = "Digest <digest@example.com>";

    expect((await getEmailProvider()).constructor.name).toBe("SmtpEmailProvider");
  });

  it("requires SMTP outside explicit test mock configuration", async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.SMTP_URL;

    expect((await getEmailProvider()).constructor.name).toBe("UnimplementedEmailProvider");
  });
});

describe("SMTP digest rendering", () => {
  it("renders markdown-like digest content into readable HTML blocks", () => {
    const html = digestToHtml({
      title: "今日重点财经摘要",
      generatedAt: "2026-05-22T08:00:00.000Z",
      sections: [
        {
          heading: "AI 摘要",
          body: [
            "## 每日财经摘要",
            "### 行情速览",
            "| 标的 | 市场 | 收盘价 |",
            "| --- | --- | --- |",
            "| TSLA | US | 340.00 |",
            "",
            "- **特斯拉** 今日波动较大",
            "- 关注盘后消息",
          ].join("\n"),
        },
      ],
    });

    expect(html).toContain("<h3");
    expect(html).toContain("每日财经摘要");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("<ul");
    expect(html).toContain("<strong>特斯拉</strong>");
    expect(html).not.toContain("## 每日财经摘要");
    expect(html).not.toContain("| --- | --- | --- |");
  });

  it("normalizes a JSON digest that was stored as a section body", () => {
    const malformedBody = JSON.stringify({
      title: "全球股市下跌",
      sections: [
        {
          heading: "行情速览",
          body: "美股盘前期指大幅下跌。\\n科技股普遍承压。",
          sources: [{ title: "美股盘前期指", url: "https://finance.yahoo.com/example" }],
        },
      ],
    });
    const digest = normalizeDigest({
      title: "今日重点财经摘要",
      generatedAt: "2026-06-09T08:00:00.000Z",
      sections: [{ heading: "AI 摘要", body: malformedBody }],
    });
    const html = digestToHtml(digest);

    expect(digest.title).toBe("全球股市下跌");
    expect(digest.sections[0]?.heading).toBe("行情速览");
    expect(html).toContain("行情速览");
    expect(html).toContain("科技股普遍承压");
    expect(html).not.toContain("&quot;sections&quot;");
    expect(html).not.toContain("{&quot;title&quot;");
  });
});
