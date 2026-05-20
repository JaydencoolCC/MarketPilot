"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { EmailDigestSetting, Market } from "@/lib/domain/types";

type EmailSettingsFormProps = {
  initialSetting: EmailDigestSetting;
};

export function EmailSettingsForm({ initialSetting }: EmailSettingsFormProps) {
  const [setting, setSetting] = useState(initialSetting);
  const [message, setMessage] = useState("我会按这个时间整理每日摘要。");
  const [saving, setSaving] = useState(false);

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
      setMessage("已保存。真实邮件 provider 接入后会按时发送。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">每日邮件</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
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

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" />
          保存设置
        </Button>
      </div>
    </form>
  );
}
