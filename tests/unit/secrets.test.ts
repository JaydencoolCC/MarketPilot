import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hasSettingsEncryptionKey, maskSecret } from "@/lib/utils/secrets";

const previousEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;

afterEach(() => {
  if (previousEncryptionKey === undefined) {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  } else {
    process.env.SETTINGS_ENCRYPTION_KEY = previousEncryptionKey;
  }
});

describe("secret utilities", () => {
  it("encrypts and decrypts secrets with AES-GCM payloads", () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key";
    const encrypted = encryptSecret("test-secret-value");

    expect(encrypted).not.toContain("test-secret-value");
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe("test-secret-value");
  });

  it("masks API keys without exposing full values", () => {
    expect(maskSecret("key-4245e8222613472")).toBe("key...****472");
  });

  it("detects missing encryption key", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(hasSettingsEncryptionKey()).toBe(false);
  });
});
