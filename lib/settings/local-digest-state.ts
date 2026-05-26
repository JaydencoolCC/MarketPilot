import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DigestPreview } from "@/lib/domain/types";

export type LocalDigestRecord = {
  date: string;
  recipientEmail: string;
  status: "draft" | "sent" | "failed";
  sentAt?: string;
  digest?: DigestPreview;
  digestTitle?: string;
  generatedAt?: string;
};

type LocalDigestStateFile = {
  records?: Record<string, LocalDigestRecord>;
};

const DIGEST_STATE_PATH = join(process.cwd(), ".local", "digest-state.json");

const globalDigestState = globalThis as typeof globalThis & {
  tradeLocalDigestState?: LocalDigestStateFile;
};

function digestKey(date: string, recipientEmail: string) {
  return `${date}::${recipientEmail.trim().toLowerCase()}`;
}

function readDigestStateFile(): LocalDigestStateFile {
  if (process.env.NODE_ENV === "test") {
    globalDigestState.tradeLocalDigestState ??= {};
    return globalDigestState.tradeLocalDigestState;
  }

  if (!existsSync(DIGEST_STATE_PATH)) return {};

  try {
    return JSON.parse(readFileSync(DIGEST_STATE_PATH, "utf8")) as LocalDigestStateFile;
  } catch {
    return {};
  }
}

function writeDigestStateFile(state: LocalDigestStateFile) {
  if (process.env.NODE_ENV === "test") {
    globalDigestState.tradeLocalDigestState = state;
    return;
  }

  mkdirSync(dirname(DIGEST_STATE_PATH), { recursive: true });
  const tmpPath = `${DIGEST_STATE_PATH}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, DIGEST_STATE_PATH);
}

export function getLocalDigestRecord(input: { date: string; recipientEmail: string }) {
  const state = readDigestStateFile();
  return state.records?.[digestKey(input.date, input.recipientEmail)] ?? null;
}

export function saveLocalDigestRecord(record: LocalDigestRecord) {
  const state = readDigestStateFile();
  state.records = {
    ...state.records,
    [digestKey(record.date, record.recipientEmail)]: record,
  };
  writeDigestStateFile(state);
  return record;
}

export function resetLocalDigestStateForTests() {
  globalDigestState.tradeLocalDigestState = {};
}
