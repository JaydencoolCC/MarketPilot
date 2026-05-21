import { afterEach, describe, expect, it } from "vitest";
import { getEmailProvider } from "@/lib/providers/email";

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
