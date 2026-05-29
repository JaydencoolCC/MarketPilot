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
import type {
  EmailDigestSetting,
  PublicIntegrationSetting,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

type SettingsCenterProps = {
  initialEmailSetting: EmailDigestSetting;
  initialIntegrations: PublicIntegrationSetting[];
};

const navItems = [
  { href: "#status", label: "连接状态" },
  { href: "#chat", label: "AI Chat" },
  { href: "#email", label: "每日邮件" },
  { href: "#market", label: "行情与新闻" },
  { href: "#security", label: "安全" },
];

export function SettingsCenter({ initialEmailSetting, initialIntegrations }: SettingsCenterProps) {
  const [integrations, setIntegrations] = useState(initialIntegrations);

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
              {item.label}
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
                连接状态
              </div>
              <h2 className="mt-2 text-lg font-semibold text-ink">服务是否准备好，一眼看清</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                这里显示当前真实连接状态。连接失败时，我会说明缺什么。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {integrations.map((item) => (
                <Badge key={item.kind} tone={item.status === "failed" ? "red" : "green"}>
                  {item.label} {item.status === "success" ? "已连接" : item.status === "failed" ? "未配置" : "待测试"}
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
              <h2 className="text-lg font-semibold text-ink">安全边界</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                API Key 和 SMTP 授权码保存在本机配置文件中。前端只拿到脱敏状态，不会拿到原始密钥；日志、测试和文档也不能写入真实密钥。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ProviderStatusCard({
  integration,
  onUpdate,
}: {
  integration: PublicIntegrationSetting;
  onUpdate: (integration: PublicIntegrationSetting) => void;
}) {
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
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">{integration.label}</div>
          <p className="mt-1 text-xs leading-5 text-muted">{integration.statusMessage}</p>
        </div>
        <StatusDot status={integration.status} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Badge tone={integration.source === "unconfigured" ? "amber" : "green"}>{sourceLabel(integration.source)}</Badge>
        <Button size="sm" variant="secondary" onClick={testProvider} disabled={testing}>
          <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} />
          {testing ? "检测中" : "检测连接"}
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
  const [baseUrl, setBaseUrl] = useState(integration.baseUrl ?? "");
  const [modelName, setModelName] = useState(integration.modelName ?? "");
  const [apiKey, setApiKey] = useState("");
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [message, setMessage] = useState(integration.statusMessage);
  const [busy, setBusy] = useState(false);

  const savedKeyDisplay = integration.secretConfigured ? "********" : "";
  const keyHint = useMemo(() => {
    if (!integration.secretConfigured) return "还没有保存 API Key";
    return integration.secretPreview ? `已保存 ${integration.secretPreview}` : "已通过环境变量配置";
  }, [integration.secretConfigured, integration.secretPreview]);

  async function saveModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((editingApiKey || !integration.secretConfigured) && !apiKey.trim()) {
      setMessage("请输入 API Key 后再保存。");
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
        setMessage(payload.error?.message ?? "保存失败，请检查模型配置。");
        return;
      }
      onUpdate(payload.data);
      setApiKey("");
      setEditingApiKey(false);
      setMessage("已保存。API Key 只会以脱敏状态显示。");
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
      setMessage(payload.result?.message ?? payload.error?.message ?? "模型连接测试完成。");
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
          <h2 className="mt-2 text-lg font-semibold text-ink">连接你的模型 API</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            支持 OpenAI-compatible API。保存后我只显示脱敏状态，不回显完整密钥。
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
          模型名称
          <Input
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            placeholder="gpt-4.1-mini 或你的模型名"
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
            placeholder="输入 API Key，保存后会显示为 ********"
          />
        </label>
        <div className="md:col-span-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm leading-6 text-muted">{message}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={testModel} disabled={busy}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
              {busy ? "检测中" : "检测连接"}
            </Button>
            <Button type="submit" disabled={busy}>
              <Save className="h-4 w-4" />
              保存 Chat 配置
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
              <h2 className="text-lg font-semibold text-ink">{integration.label}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">{integration.description}</p>
            </div>
            <Badge tone={integration.source === "unconfigured" ? "amber" : "green"}>{sourceLabel(integration.source)}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">{integration.statusMessage}</p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-surface/60 p-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <StatusDot status={integration.status} />
              <span>{integration.status === "failed" ? "连接失败" : "可手动检测连接"}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={testProvider} disabled={testing}>
              <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} />
              {testing ? "检测中" : "检测连接"}
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

function sourceLabel(source: PublicIntegrationSetting["source"]) {
  if (source === "file") return "配置文件";
  if (source === "env") return "环境变量";
  return "未配置";
}
