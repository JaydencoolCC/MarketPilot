"use client";

import { useState } from "react";
import { Mail, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { EmailDigestSetting, Market, PublicIntegrationSetting } from "@/lib/domain/types";

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
  const realEmailReady = Boolean(integration && integration.source !== "mock" && integration.status !== "failed");
  const providerLabel = integration?.source === "file" ? "配置文件" : integration?.source === "mock" ? "Mock" : (integration?.provider ?? "未配置");
  const [setting, setSetting] = useState(initialSetting);
  const [authCode, setAuthCode] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.qq.com");
  const [smtpPort, setSmtpPort] = useState("465");
  const [from, setFrom] = useState(integration?.baseUrl ?? "");
  const providerMessage = authCode.trim()
    ? "已输入新的 SMTP 授权码，保存后会替换旧连接。"
    : integration?.statusMessage ?? "邮件 provider 尚未配置。";
  const defaultMessage = realEmailReady
    ? "我会按这个时间整理并发送每日摘要。"
    : integration?.secretConfigured
      ? "邮件连接已保存。可以先测试发送。"
      : "当前还没有真实邮件连接，保存设置不会发出邮件。";
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
        setMessage(payload.error?.message ?? "保存失败，请检查邮箱和时间。");
        return;
      }
      setSetting(payload.data);
      if (authCode.trim()) {
        const savedProvider = await saveProviderConnection();
        if (savedProvider) setMessage("设置和邮件连接已保存。可以先测试发送。");
        return;
      }
      setMessage(realEmailReady ? "已保存。到点后会通过真实邮件 provider 发送。" : "已保存，但当前邮件 provider 还不能真实发送。");
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
        setMessage(payload.error?.message ?? "邮件发送失败，请检查 SMTP 配置。");
        return;
      }
      setMessage(payload.data?.message ?? "邮件请求已处理。");
    } finally {
      setSending(false);
    }
  }

  async function saveProvider() {
    setSavingProvider(true);
    try {
      const savedProvider = await saveProviderConnection();
      if (savedProvider) setMessage("邮件连接已保存。可以先测试发送。");
    } finally {
      setSavingProvider(false);
    }
  }

  async function saveProviderConnection() {
    if (!authCode.trim() && !integration?.secretConfigured) {
      setMessage("请输入 SMTP 授权码后再保存邮件连接。");
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
      setMessage(payload.error?.message ?? "保存邮件连接失败。");
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
          <h2 className="text-lg font-semibold text-ink">每日邮件</h2>
          <p className="mt-1 text-sm text-muted">{message ?? defaultMessage}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            当前邮件来源：{providerLabel}。{providerMessage}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={setting.enabled}
            onChange={(event) => setSetting({ ...setting, enabled: event.target.checked })}
            className="h-4 w-4 accent-moss"
          />
          启用
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-ink">
          SMTP 授权码
          <Input
            type="password"
            value={authCode}
            onChange={(event) => setAuthCode(event.target.value)}
            placeholder={
              integration?.encryptionConfigured
                ? integration.secretConfigured
                  ? "已保存授权码，留空则不替换"
                  : "QQ 邮箱 SMTP 授权码，不是登录密码"
                : "输入授权码，保存时会创建本地加密密钥"
            }
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          发件人
          <Input
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="你的QQ号@qq.com"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          SMTP 服务器
          <Input
            value={smtpHost}
            onChange={(event) => setSmtpHost(event.target.value)}
            placeholder="smtp.qq.com"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          SMTP 端口
          <Input
            inputMode="numeric"
            value={smtpPort}
            onChange={(event) => setSmtpPort(event.target.value)}
            placeholder="465"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          收件邮箱
          <Input
            type="email"
            value={setting.recipientEmail}
            onChange={(event) => setSetting({ ...setting, recipientEmail: event.target.value })}
            placeholder="you@example.com"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          发送时间
          <Input
            type="time"
            value={setting.sendTime}
            onChange={(event) => setSetting({ ...setting, sendTime: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-ink">
          时区
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
          只推送自选股相关新闻
        </label>
      </div>

      <div className="mt-5">
        <div className="text-sm font-medium text-ink">关注市场</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["US", "HK", "CN"] as const).map((market) => (
            <Button
              key={market}
              type="button"
              variant={setting.markets.includes(market) ? "primary" : "secondary"}
              size="sm"
              onClick={() => toggleMarket(market)}
            >
              {market === "US" ? "美股" : market === "HK" ? "港股" : "A股"}
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
          保存邮件连接
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || sending}
          onClick={() => void sendMail("/api/digests/send-test", "正在发送测试邮件。")}
        >
          <Mail className="h-4 w-4" />
          测试发送
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || sending}
          onClick={() => void sendMail("/api/digests/send", "正在发送今日摘要。")}
        >
          <Send className="h-4 w-4" />
          发送今日
        </Button>
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" />
          保存设置
        </Button>
      </div>
    </form>
  );
}
