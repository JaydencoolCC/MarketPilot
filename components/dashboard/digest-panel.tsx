"use client";

import { useState } from "react";
import { FileText, Mail, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DigestPreview } from "@/lib/domain/types";
import { relativeTime } from "@/lib/utils/format";

export function DigestPanel() {
  const [digest, setDigest] = useState<DigestPreview | null>(null);
  const [status, setStatus] = useState("我会在发送前整理重点新闻和自选股变化。");
  const [loading, setLoading] = useState(false);

  async function previewDigest() {
    setLoading(true);
    setStatus("正在整理今日重点。");
    try {
      const response = await fetch("/api/digests/preview", { method: "POST" });
      const payload = (await response.json()) as { data?: DigestPreview; error?: { message: string } };
      if (!response.ok || !payload.data) {
        setStatus(payload.error?.message ?? "摘要生成失败，可以稍后重试。");
        return;
      }
      setDigest(payload.data);
      setStatus("摘要已生成，真实邮件 provider 接入后可按时发送。");
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setLoading(true);
    setStatus("正在模拟发送测试邮件。");
    try {
      const response = await fetch("/api/digests/send-test", { method: "POST" });
      const payload = (await response.json()) as {
        data?: { message: string };
        digest?: DigestPreview;
        error?: { message: string };
      };
      if (!response.ok) {
        setStatus(payload.error?.message ?? "测试邮件发送失败。");
        return;
      }
      setDigest(payload.digest ?? null);
      setStatus(payload.data?.message ?? "测试邮件已模拟发送。");
    } finally {
      setLoading(false);
    }
  }

  async function sendDaily() {
    setLoading(true);
    setStatus("正在发送今日摘要。");
    try {
      const response = await fetch("/api/digests/send", { method: "POST" });
      const payload = (await response.json()) as {
        data?: { message: string; status: "sent" | "skipped" };
        digest?: DigestPreview;
        error?: { message: string };
      };
      if (!response.ok) {
        setStatus(payload.error?.message ?? "今日摘要发送失败。");
        return;
      }
      setDigest(payload.digest ?? null);
      setStatus(payload.data?.message ?? "今日摘要已处理。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white/85 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-moss">
            <Sparkles className="h-4 w-4" />
            今日重点
          </div>
          <h2 className="mt-2 text-lg font-semibold text-ink">每日摘要预览</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{status}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={previewDigest} disabled={loading}>
          <FileText className="h-4 w-4" />
          预览摘要
        </Button>
        <Button size="sm" variant="secondary" onClick={sendTest} disabled={loading}>
          <Mail className="h-4 w-4" />
          测试发送
        </Button>
        <Button size="sm" variant="secondary" onClick={sendDaily} disabled={loading}>
          <Send className="h-4 w-4" />
          发送今日
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        {digest ? (
          <>
            <div>
              <h3 className="text-sm font-semibold text-ink">{digest.title}</h3>
              <p className="mt-1 text-xs text-muted">生成于 {relativeTime(digest.generatedAt)}</p>
            </div>
            {digest.sections.map((section) => (
              <div key={section.heading} className="rounded-md border border-line bg-surface/60 p-3">
                <h4 className="text-sm font-semibold text-ink">{section.heading}</h4>
                <p className="mt-2 text-sm leading-6 text-muted">{section.body}</p>
              </div>
            ))}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-line bg-surface/50 p-4 text-sm leading-6 text-muted">
            过去 24 小时的重点会在这里预览。没有新闻时，我会直接告诉你，而不是编造摘要。
          </div>
        )}
      </div>
    </section>
  );
}
