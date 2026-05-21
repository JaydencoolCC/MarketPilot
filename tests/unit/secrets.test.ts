import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { decryptSecret, encryptSecret, hasSettingsEncryptionKey, maskSecret } from "@/lib/utils/secrets";

const previousEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
const localKeyPath = join(process.cwd(), ".local", "settings-encryption-key");

afterEach(() => {
  rmSync(localKeyPath, { force: true });
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

  it("creates a local development key when no encryption key is configured", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    const encrypted = encryptSecret("local-secret-value");

    expect(hasSettingsEncryptionKey()).toBe(true);
    expect(existsSync(localKeyPath)).toBe(true);
    expect(decryptSecret(encrypted)).toBe("local-secret-value");
  });
});
