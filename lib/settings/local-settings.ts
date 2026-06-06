import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  EmailDigestSetting,
  IntegrationKind,
  IntegrationSetting,
  MarketDataNetworkSetting,
} from "@/lib/domain/types";

type LocalSettingsFile = {
  emailSetting?: EmailDigestSetting;
  integrations?: Partial<Record<IntegrationKind, IntegrationSetting>>;
  marketDataNetwork?: MarketDataNetworkSetting;
};

const SETTINGS_PATH = join(process.cwd(), ".local", "settings.json");

const globalLocalSettings = globalThis as typeof globalThis & {
  tradeLocalSettings?: LocalSettingsFile;
};

function readSettingsFile(): LocalSettingsFile {
  if (process.env.NODE_ENV === "test") {
    globalLocalSettings.tradeLocalSettings ??= {};
    return globalLocalSettings.tradeLocalSettings;
  }

  if (!existsSync(SETTINGS_PATH)) return {};

  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as LocalSettingsFile;
  } catch {
    return {};
  }
}

function writeSettingsFile(settings: LocalSettingsFile) {
  if (process.env.NODE_ENV === "test") {
    globalLocalSettings.tradeLocalSettings = settings;
    return;
  }

  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  const tmpPath = `${SETTINGS_PATH}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, SETTINGS_PATH);
}

export function getLocalEmailSetting() {
  return readSettingsFile().emailSetting ?? null;
}

export function saveLocalEmailSetting(setting: EmailDigestSetting) {
  const settings = readSettingsFile();
  settings.emailSetting = setting;
  writeSettingsFile(settings);
  return setting;
}

export function getLocalIntegrationSetting(kind: IntegrationKind) {
  return readSettingsFile().integrations?.[kind] ?? null;
}

export function saveLocalIntegrationSetting(setting: IntegrationSetting) {
  const settings = readSettingsFile();
  settings.integrations = {
    ...settings.integrations,
    [setting.kind]: setting,
  };
  writeSettingsFile(settings);
  return setting;
}

export function getLocalMarketDataNetworkSetting() {
  return readSettingsFile().marketDataNetwork ?? {};
}

export function saveLocalMarketDataNetworkSetting(setting: MarketDataNetworkSetting) {
  const settings = readSettingsFile();
  settings.marketDataNetwork = setting;
  writeSettingsFile(settings);
  return setting;
}

export function resetLocalSettingsForTests() {
  globalLocalSettings.tradeLocalSettings = {};
}
