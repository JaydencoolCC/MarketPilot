import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AppError } from "@/lib/domain/errors";

const VERSION = "v1";
const LOCAL_KEY_PATH = join(process.cwd(), ".local", "settings-encryption-key");

function configuredSecret() {
  const envSecret = process.env.SETTINGS_ENCRYPTION_KEY?.trim();
  if (envSecret) return envSecret;
  if (existsSync(LOCAL_KEY_PATH)) {
    return readFileSync(LOCAL_KEY_PATH, "utf8").trim();
  }
  return "";
}

export function hasSettingsEncryptionKey() {
  return configuredSecret().length > 0 || process.env.NODE_ENV !== "production";
}

function encryptionKey() {
  const raw = configuredSecret() || createLocalSecret();
  if (!raw) {
    throw new AppError(
      "VALIDATION_ERROR",
      "缺少 SETTINGS_ENCRYPTION_KEY，不能保存密钥。",
      400,
    );
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32) {
    return base64;
  }

  return createHash("sha256").update(raw).digest();
}

function createLocalSecret() {
  if (process.env.NODE_ENV === "production") return "";
  const secret = randomBytes(32).toString("base64url");
  mkdirSync(dirname(LOCAL_KEY_PATH), { recursive: true });
  writeFileSync(LOCAL_KEY_PATH, secret, { mode: 0o600 });
  return secret;
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string) {
  const [version, iv, authTag, ciphertext] = payload.split(":");
  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new AppError("VALIDATION_ERROR", "密钥密文格式无效。", 400);
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function maskSecret(secret: string) {
  const trimmed = secret.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 3)}...****${trimmed.slice(-3)}`;
}
