"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Database,
  KeyRound,
  Mail,
  Newspaper,
  RefreshCw,
  Save,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailSettingsForm } from "@/components/settings/email-settings-form";
import { useLocale } from "@/components/i18n/locale-provider";
import type {
  EmailDigestSetting,
  MarketDataNetworkSetting,
  PublicIntegrationSetting,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { localizedApiMessage } from "@/lib/i18n";

type SettingsCenterProps = {
  initialEmailSetting: EmailDigestSetting;
  initialIntegrations: PublicIntegrationSetting[];
  initialMarketDataNetwork: MarketDataNetworkSetting;
};

const navItems = [
  { href: "#status", key: "status" },
  { href: "#chat", key: "chat" },
  { href: "#email", key: "email" },
  { href: "#market", key: "market" },
  { href: "#security", key: "security" },
] as const;

export function SettingsCenter({
  initialEmailSetting,
  initialIntegrations,
  initialMarketDataNetwork,
}: SettingsCenterProps) {
  const { t } = useLocale();
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [marketDataNetwork, setMarketDataNetwork] = useState(initialMarketDataNetwork);

  function updateIntegration(next: PublicIntegrationSetting) {
    setIntegrations((current) => current.map((item) => (item.kind === next.kind ? next : item)));
  }

  const modelIntegration = integrations.find((item) => item.kind === "model");
  const marketIntegrations = integrations.filter((item) => item.kind === "quote" || item.kind === "news");
  const emailIntegration = integrations.find((item) => item.kind === "email");

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-5 rounded-lg border border-line bg-white/80 p-2 shadow-soft">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-moss/10 hover:text-ink"
            >
              {t.settings.nav[item.key]}
            </a>
          ))}
        </nav>
      </aside>

      <div className="space-y-5">
        <section id="status" className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-moss">
                <Wifi className="h-4 w-4" />
                {t.settings.nav.status}
              </div>
              <h2 className="mt-2 text-lg font-semibold text-ink">{t.settings.statusTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t.settings.statusBody}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {integrations.map((item) => (
                <Badge key={item.kind} tone={item.status === "failed" ? "red" : "green"}>
                  {providerLabel(item, t)} {item.status === "success" ? t.common.sourceStatus.success : item.status === "failed" ? t.common.sourceStatus.failed : t.common.sourceStatus.pending}
                </Badge>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {integrations.map((item) => (
              <ProviderStatusCard key={item.kind} integration={item} onUpdate={updateIntegration} />
            ))}
          </div>
        </section>

        {modelIntegration ? (
          <ModelSettingsCard integration={modelIntegration} onUpdate={updateIntegration} />
        ) : null}

        <section id="email">
          <EmailSettingsForm
            initialSetting={initialEmailSetting}
            integration={emailIntegration}
            onProviderUpdate={updateIntegration}
          />
        </section>

        <section id="market" className="grid gap-4 md:grid-cols-2">
          <MarketDataNetworkCard setting={marketDataNetwork} onUpdate={setMarketDataNetwork} />
          {marketIntegrations.map((item) => (
            <MarketProviderCard key={item.kind} integration={item} onUpdate={updateIntegration} />
          ))}
          {emailIntegration ? (
            <MarketProviderCard integration={emailIntegration} onUpdate={updateIntegration} />
          ) : null}
        </section>

        <section id="security" className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-moss/10 text-moss">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
            <h2 className="text-lg font-semibold text-ink">{t.settings.securityTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {t.settings.securityBody}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MarketDataNetworkCard({
  setting,
  onUpdate,
}: {
  setting: MarketDataNetworkSetting;
  onUpdate: (setting: MarketDataNetworkSetting) => void;
}) {
  const { locale, t } = useLocale();
  const [proxyUrl, setProxyUrl] = useState(setting.proxyUrl ?? "");
  const [message, setMessage] = useState(setting.proxyUrl ? t.settings.proxySavedInitial : t.settings.proxyUnconfiguredInitial);
  const [busy, setBusy] = useState(false);

  async function saveProxy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/settings/market-data-network", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });
      const payload = (await response.json()) as {
        data?: MarketDataNetworkSetting;
        error?: { message: string };
      };
      if (!response.ok || !payload.data) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.settings.proxySaveFailed));
        return;
      }
      onUpdate(payload.data);
      setProxyUrl(payload.data.proxyUrl ?? "");
      setMessage(payload.data.proxyUrl ? t.settings.proxySaved : t.settings.proxyCleared);
    } finally {
      setBusy(false);
    }
  }

  async function testProxy() {
    setBusy(true);
    try {
      const response = await fetch("/api/settings/market-data-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });
      const payload = (await response.json()) as {
        data?: MarketDataNetworkSetting;
        result?: { message: string };
        error?: { message: string };
      };
      if (payload.data) {
        onUpdate(payload.data);
        setProxyUrl(payload.data.proxyUrl ?? "");
      }
      setMessage(localizedApiMessage(locale, payload.result?.message ?? payload.error?.message, t.settings.proxyTestDone));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft md:col-span-2">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ocean/10 text-ocean">
          <Wifi className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t.settings.proxyTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t.settings.proxyBody}
              </p>
            </div>
            <Badge tone={setting.proxyUrl ? "green" : "amber"}>{setting.proxyUrl ? t.settings.configured : t.settings.unconfigured}</Badge>
          </div>
          <form onSubmit={saveProxy} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="space-y-2 text-sm font-medium text-ink">
              {t.settings.proxyUrl}
              <Input
                value={proxyUrl}
                onChange={(event) => setProxyUrl(event.target.value)}
                placeholder={t.settings.proxyPlaceholder}
              />
            </label>
            <Button type="button" variant="secondary" className="whitespace-nowrap" onClick={testProxy} disabled={busy}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
              {busy ? t.settings.testing : t.settings.testProxy}
            </Button>
            <Button type="submit" className="whitespace-nowrap" disabled={busy}>
              <Save className="h-4 w-4" />
              {t.settings.saveProxy}
            </Button>
          </form>
          <p className="mt-3 text-sm text-muted">{message}</p>
        </div>
      </div>
    </section>
  );
}

function ProviderStatusCard({
  integration,
  onUpdate,
}: {
  integration: PublicIntegrationSetting;
  onUpdate: (integration: PublicIntegrationSetting) => void;
}) {
  const { locale, t } = useLocale();
  const [testing, setTesting] = useState(false);

  async function testProvider() {
    setTesting(true);
    try {
      const response = await fetch("/api/settings/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: integration.kind }),
      });
      const payload = (await response.json()) as {
        data?: PublicIntegrationSetting;
        error?: { message: string };
      };
      if (payload.data) onUpdate(payload.data);
      if (!response.ok && !payload.data) {
        onUpdate({
          ...integration,
          status: "failed",
          statusMessage: payload.error?.message ?? t.settings.providerTestFailed,
        });
      }
    } catch {
      onUpdate({
        ...integration,
        status: "failed",
        statusMessage: t.settings.providerTestFailed,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">{providerLabel(integration, t)}</div>
          <p className="mt-1 text-xs leading-5 text-muted">{localizedProviderStatusMessage(integration, locale, t)}</p>
        </div>
        <StatusDot status={integration.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Badge tone={integration.source === "unconfigured" ? "amber" : "green"}>{sourceLabel(integration.source, t)}</Badge>
        <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={testProvider} disabled={testing}>
          <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} />
          {testing ? t.settings.testing : t.settings.testConnection}
        </Button>
      </div>
    </div>
  );
}

function ModelSettingsCard({
  integration,
  onUpdate,
}: {
  integration: PublicIntegrationSetting;
  onUpdate: (integration: PublicIntegrationSetting) => void;
}) {
  const { locale, t } = useLocale();
  const [baseUrl, setBaseUrl] = useState(integration.baseUrl ?? "");
  const [modelName, setModelName] = useState(integration.modelName ?? "");
  const [apiKey, setApiKey] = useState("");
  const [editingApiKey, setEditingApiKey] = useState(false);
  const message = localizedProviderStatusMessage(integration, locale, t);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const savedKeyDisplay = integration.secretConfigured ? "********" : "";
  const keyHint = useMemo(() => {
    if (!integration.secretConfigured) return t.settings.savedKeyEmpty;
    return integration.secretPreview ? t.settings.savedKeyPreview(integration.secretPreview) : t.settings.savedKeyEnv;
  }, [integration.secretConfigured, integration.secretPreview, t.settings]);

  async function saveModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((editingApiKey || !integration.secretConfigured) && !apiKey.trim()) {
      setActionMessage(t.settings.enterApiKey);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/settings/model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          modelName,
          apiKey: editingApiKey ? apiKey.trim() || undefined : undefined,
        }),
      });
      const payload = (await response.json()) as {
        data?: PublicIntegrationSetting;
        error?: { message: string };
      };
      if (!response.ok || !payload.data) {
        setActionMessage(localizedApiMessage(locale, payload.error?.message, t.settings.modelSaveFailed));
        return;
      }
      onUpdate(payload.data);
      setApiKey("");
      setEditingApiKey(false);
      setActionMessage(t.settings.modelSaved);
    } finally {
      setBusy(false);
    }
  }

  async function testModel() {
    setBusy(true);
    try {
      const response = await fetch("/api/settings/model/test", { method: "POST" });
      const payload = (await response.json()) as {
        data?: PublicIntegrationSetting;
        result?: { message: string };
        error?: { message: string };
      };
      if (payload.data) onUpdate(payload.data);
      setActionMessage(
        response.ok
          ? t.settings.providerStatusSuccess.model
          : localizedApiMessage(locale, payload.error?.message, t.settings.providerTestFailed),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="chat" className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-moss">
            <Bot className="h-4 w-4" />
            AI Chat
          </div>
          <h2 className="mt-2 text-lg font-semibold text-ink">{t.settings.modelTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {t.settings.modelBody}
          </p>
        </div>
        <Badge tone={integration.secretConfigured ? "green" : "amber"}>{keyHint}</Badge>
      </div>

      <form onSubmit={saveModel} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-ink">
          Base URL
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.settings.modelName}
          <Input
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            placeholder={t.settings.modelPlaceholder}
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink md:col-span-2">
          API Key
          <Input
            type="text"
            value={editingApiKey ? apiKey : savedKeyDisplay}
            onChange={(event) => {
              if (!editingApiKey) setEditingApiKey(true);
              setApiKey(event.target.value);
            }}
            onFocus={() => {
              if (!editingApiKey) {
                setEditingApiKey(true);
                setApiKey("");
              }
            }}
            placeholder={t.settings.apiKeyPlaceholder}
          />
        </label>
        <div className="md:col-span-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm leading-6 text-muted">{actionMessage ?? message}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="whitespace-nowrap" onClick={testModel} disabled={busy}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
              {busy ? t.settings.testing : t.settings.testConnection}
            </Button>
            <Button type="submit" className="whitespace-nowrap" disabled={busy}>
              <Save className="h-4 w-4" />
              {t.settings.saveChatConfig}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function MarketProviderCard({
  integration,
  onUpdate,
}: {
  integration: PublicIntegrationSetting;
  onUpdate: (integration: PublicIntegrationSetting) => void;
}) {
  const { locale, t } = useLocale();
  const [testing, setTesting] = useState(false);
  const Icon = integration.kind === "quote" ? Database : integration.kind === "news" ? Newspaper : Mail;

  async function testProvider() {
    setTesting(true);
    try {
      const response = await fetch("/api/settings/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: integration.kind }),
      });
      const payload = (await response.json()) as {
        data?: PublicIntegrationSetting;
        error?: { message: string };
      };
      if (payload.data) onUpdate(payload.data);
      if (!response.ok && !payload.data) {
        onUpdate({
          ...integration,
          status: "failed",
          statusMessage: payload.error?.message ?? t.settings.providerTestFailed,
        });
      }
    } catch {
      onUpdate({
        ...integration,
        status: "failed",
        statusMessage: t.settings.providerTestFailed,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ocean/10 text-ocean">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">{providerLabel(integration, t)}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">{providerDescription(integration, t)}</p>
            </div>
            <Badge tone={integration.source === "unconfigured" ? "amber" : "green"}>{sourceLabel(integration.source, t)}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">{localizedProviderStatusMessage(integration, locale, t)}</p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-surface/60 p-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <StatusDot status={integration.status} />
              <span>{integration.status === "failed" ? t.settings.connectionFailed : t.settings.canTestManually}</span>
            </div>
            <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={testProvider} disabled={testing}>
              <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} />
              {testing ? t.settings.testing : t.settings.testConnection}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusDot({
  status,
}: {
  status: PublicIntegrationSetting["status"];
}) {
  return (
    <span
      className={cn(
        "mt-1 flex h-8 w-8 items-center justify-center rounded-full",
        status === "failed" && "bg-coral/10 text-coral",
        status !== "failed" && "bg-moss/10 text-moss",
      )}
    >
      {status === "failed" ? <KeyRound className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
    </span>
  );
}

function sourceLabel(source: PublicIntegrationSetting["source"], t: ReturnType<typeof useLocale>["t"]) {
  if (source === "file") return t.common.sourceStatus.file;
  if (source === "env") return t.common.sourceStatus.env;
  return t.common.sourceStatus.unconfigured;
}

function providerLabel(integration: PublicIntegrationSetting, t: ReturnType<typeof useLocale>["t"]) {
  if (t.common.settings !== "Settings") return integration.label;
  if (integration.kind === "model") return "AI Chat";
  if (integration.kind === "quote") return "Quotes";
  if (integration.kind === "news") return "News";
  if (integration.kind === "email") return "Email";
  return integration.label;
}

function providerDescription(integration: PublicIntegrationSetting, t: ReturnType<typeof useLocale>["t"]) {
  if (integration.kind === "quote") return t.settings.quoteProviderBody;
  if (integration.kind === "news") return t.settings.newsProviderBody;
  if (integration.kind === "email") return t.settings.emailProviderBody;
  return integration.description;
}

function providerStatusMessage(integration: PublicIntegrationSetting, t: ReturnType<typeof useLocale>["t"]) {
  if (integration.status === "success") return t.common.sourceStatus.success;
  if (integration.status === "untested") return t.common.sourceStatus.pending;
  return t.settings.connectionFailed;
}

function localizedProviderStatusMessage(
  integration: PublicIntegrationSetting,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
) {
  if (locale === "zh") {
    return integration.statusMessage ?? providerStatusMessage(integration, t);
  }
  if (integration.status === "success") return t.settings.providerStatusSuccess[integration.kind];
  if (integration.status === "failed") return t.settings.connectionFailed;
  return t.common.sourceStatus.pending;
}
