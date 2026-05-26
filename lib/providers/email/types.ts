import type { DigestPreview, EmailDigestSetting } from "@/lib/domain/types";

export type DigestEmail = {
  setting: EmailDigestSetting;
  digest: DigestPreview;
  test?: boolean;
};

export type EmailSendResult = {
  id: string;
  status: "sent" | "mocked";
  message: string;
};

export interface EmailProvider {
  sendDigest(input: DigestEmail): Promise<EmailSendResult>;
  verifyConnection(): Promise<string>;
}
