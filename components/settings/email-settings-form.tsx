"use client";

import { useState } from "react";
import { Mail, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLocale } from "@/components/i18n/locale-provider";
import type { EmailDigestSetting, Market, PublicIntegrationSetting } from "@/lib/domain/types";
import { localizedApiMessage } from "@/lib/i18n";

type EmailSettingsFormProps = {
  initialSetting: EmailDigestSetting;
  integration: PublicIntegrationSetting | undefined;
  onProviderUpdate: (integration: PublicIntegrationSetting) => void;
};

export function EmailSettingsForm({
  initialSetting,
  integration,
  onProviderUpdate,
}: EmailSettingsFormProps) {
  const { locale, t } = useLocale();
  const realEmailReady = Boolean(integration && integration.source !== "mock" && integration.status !== "failed");
  const providerLabel = integration?.source === "file"
    ? t.common.sourceStatus.file
    : integration?.source === "env"
      ? t.common.sourceStatus.env
      : (integration?.provider ?? t.emailSettings.providerUnconfigured);
  const [setting, setSetting] = useState(initialSetting);
  const [authCode, setAuthCode] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.qq.com");
  const [smtpPort, setSmtpPort] = useState("465");
  const [from, setFrom] = useState(integration?.baseUrl ?? "");
  const providerMessage = authCode.trim()
    ? t.emailSettings.newAuthCode
    : locale === "zh"
      ? integration?.statusMessage ?? t.emailSettings.providerMissing
      : integration?.status === "success"
        ? t.emailSettings.connectionSaved
        : t.emailSettings.providerMissing;
  const defaultMessage = realEmailReady
    ? t.emailSettings.readyMessage
    : integration?.secretConfigured
      ? t.emailSettings.connectionSaved
      : t.emailSettings.notReadyMessage;
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  function toggleMarket(market: Market) {
    const markets = setting.markets.includes(market)
      ? setting.markets.filter((item) => item !== market)
      : [...setting.markets, market];
    setSetting({ ...setting, markets: markets.length ? markets : [market] });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: setting.enabled,
          recipientEmail: setting.recipientEmail,
          sendTime: setting.sendTime,
          timezone: setting.timezone,
          markets: setting.markets,
          watchlistOnly: setting.watchlistOnly,
        }),
      });
      const payload = (await response.json()) as { data?: EmailDigestSetting; error?: { message: string } };
      if (!response.ok || !payload.data) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.emailSettings.saveFailed));
        return;
      }
      setSetting(payload.data);
      if (authCode.trim()) {
        const savedProvider = await saveProviderConnection();
        if (savedProvider) {
          setMessage(t.emailSettings.settingsAndProviderSaved);
        }
        return;
      }
      setMessage(realEmailReady ? t.emailSettings.savedReady : t.emailSettings.savedNotReady);
    } catch {
      setMessage(t.emailSettings.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function sendMail(path: string, pendingMessage: string) {
    setSending(true);
    setMessage(pendingMessage);
    try {
      const response = await fetch(path, { method: "POST" });
      const payload = (await response.json()) as {
        data?: { message: string };
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.emailSettings.sendFailed));
        return;
      }
      setMessage(localizedApiMessage(locale, payload.data?.message, t.emailSettings.requestHandled));
    } catch {
      setMessage(t.emailSettings.requestFailed);
    } finally {
      setSending(false);
    }
  }

  async function saveProvider() {
    setSavingProvider(true);
    try {
      const savedProvider = await saveProviderConnection();
      if (savedProvider) setMessage(t.emailSettings.providerSaved);
    } catch {
      setMessage(t.emailSettings.providerSaveFailed);
    } finally {
      setSavingProvider(false);
    }
  }

  async function saveProviderConnection() {
    if (!authCode.trim() && !integration?.secretConfigured) {
      setMessage(t.emailSettings.enterAuthCode);
      return false;
    }

    const response = await fetch("/api/settings/email/provider", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authCode: authCode.trim() || undefined,
        host: smtpHost.trim() || "smtp.qq.com",
        port: Number(smtpPort) || 465,
        from,
      }),
    });
    const payload = (await response.json()) as {
      data?: PublicIntegrationSetting;
      error?: { message: string };
    };
    if (!response.ok || !payload.data) {
      setMessage(localizedApiMessage(locale, payload.error?.message, t.emailSettings.providerSaveFailed));
      return false;
    }
    onProviderUpdate(payload.data);
    setAuthCode("");
    return true;
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.emailSettings.title}</h2>
          <p className="mt-1 text-sm text-muted">{message ?? defaultMessage}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {t.emailSettings.sourceLine(providerLabel, providerMessage)}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={setting.enabled}
            onChange={(event) => setSetting({ ...setting, enabled: event.target.checked })}
            className="h-4 w-4 accent-moss"
          />
          {t.emailSettings.enabled}
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.emailSettings.authCode}
          <Input
            type="password"
            value={authCode}
            onChange={(event) => setAuthCode(event.target.value)}
            placeholder={
              integration?.secretConfigured
                ? t.emailSettings.authSavedPlaceholder
                : t.emailSettings.authPlaceholder
            }
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.emailSettings.sender}
          <Input
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder={t.emailSettings.senderPlaceholder}
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.emailSettings.smtpHost}
          <Input
            value={smtpHost}
            onChange={(event) => setSmtpHost(event.target.value)}
            placeholder="smtp.qq.com"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.emailSettings.smtpPort}
          <Input
            inputMode="numeric"
            value={smtpPort}
            onChange={(event) => setSmtpPort(event.target.value)}
            placeholder="465"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.emailSettings.recipient}
          <Input
            type="email"
            value={setting.recipientEmail}
            onChange={(event) => setSetting({ ...setting, recipientEmail: event.target.value })}
            placeholder="you@example.com"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.emailSettings.sendTime}
          <Input
            type="time"
            value={setting.sendTime}
            onChange={(event) => setSetting({ ...setting, sendTime: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          {t.emailSettings.timezone}
          <Select
            value={setting.timezone}
            onChange={(event) => setSetting({ ...setting, timezone: event.target.value })}
          >
            <option value="Asia/Shanghai">Asia/Shanghai</option>
            <option value="America/New_York">America/New_York</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 pt-7 text-sm text-muted">
          <input
            type="checkbox"
            checked={setting.watchlistOnly}
            onChange={(event) => setSetting({ ...setting, watchlistOnly: event.target.checked })}
            className="h-4 w-4 accent-moss"
          />
          {t.emailSettings.watchlistOnly}
        </label>
      </div>

      <div className="mt-5">
        <div className="text-sm font-medium text-ink">{t.emailSettings.markets}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["US", "HK", "CN", "JP"] as const).map((market) => (
            <Button
              key={market}
              type="button"
              variant={setting.markets.includes(market) ? "primary" : "secondary"}
              size="sm"
              onClick={() => toggleMarket(market)}
            >
              {t.common.markets[market]}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 md:flex-row md:justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={saving || sending || savingProvider || !from.trim()}
          onClick={() => void saveProvider()}
        >
          <Save className="h-4 w-4" />
          {t.emailSettings.saveProvider}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || sending}
          onClick={() => void sendMail("/api/digests/send-test", t.emailSettings.sendingTest)}
        >
          <Mail className="h-4 w-4" />
          {t.emailSettings.testSend}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || sending}
          onClick={() => void sendMail("/api/digests/send", t.emailSettings.sendingToday)}
        >
          <Send className="h-4 w-4" />
          {t.emailSettings.sendToday}
        </Button>
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" />
          {t.emailSettings.saveSettings}
        </Button>
      </div>
    </form>
  );
}
