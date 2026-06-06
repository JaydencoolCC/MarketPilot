"use client";

import { useEffect, useState } from "react";
import { FileText, Mail, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";
import type { DigestPreview } from "@/lib/domain/types";
import { dictionary } from "@/lib/i18n";
import { relativeTime } from "@/lib/utils/format";

export function DigestPanel() {
  const { t } = useLocale();
  const [digest, setDigest] = useState<DigestPreview | null>(null);
  const [status, setStatus] = useState<string>(t.digest.initialStatus);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStatus((current) =>
      current === dictionary.zh.digest.initialStatus || current === dictionary.en.digest.initialStatus
        ? t.digest.initialStatus
        : current,
    );
  }, [t.digest.initialStatus]);

  async function previewDigest() {
    setLoading(true);
    setStatus(t.digest.loadingPreview);
    try {
      const response = await fetch("/api/digests/preview", { method: "POST" });
      const payload = (await response.json()) as { data?: DigestPreview; error?: { message: string } };
      if (!response.ok || !payload.data) {
        setStatus(payload.error?.message ?? t.digest.previewFailed);
        return;
      }
      setDigest(payload.data);
      setStatus(t.digest.previewReady);
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setLoading(true);
    setStatus(t.digest.sendingTest);
    try {
      const response = await fetch("/api/digests/send-test", { method: "POST" });
      const payload = (await response.json()) as {
        data?: { message: string };
        digest?: DigestPreview;
        error?: { message: string };
      };
      if (!response.ok) {
        setStatus(payload.error?.message ?? t.digest.testFailed);
        return;
      }
      setDigest(payload.digest ?? null);
      setStatus(payload.data?.message ?? t.digest.testSent);
    } finally {
      setLoading(false);
    }
  }

  async function sendDaily() {
    setLoading(true);
    setStatus(t.digest.sendingDaily);
    try {
      const response = await fetch("/api/digests/send", { method: "POST" });
      const payload = (await response.json()) as {
        data?: { message: string; status: "sent" | "skipped" };
        digest?: DigestPreview;
        error?: { message: string };
      };
      if (!response.ok) {
        setStatus(payload.error?.message ?? t.digest.dailyFailed);
        return;
      }
      setDigest(payload.digest ?? null);
      setStatus(payload.data?.message ?? t.digest.dailyDone);
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
            {t.digest.eyebrow}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-ink">{t.digest.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{status}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={previewDigest} disabled={loading}>
          <FileText className="h-4 w-4" />
          {t.digest.preview}
        </Button>
        <Button size="sm" variant="secondary" onClick={sendTest} disabled={loading}>
          <Mail className="h-4 w-4" />
          {t.digest.testSend}
        </Button>
        <Button size="sm" variant="secondary" onClick={sendDaily} disabled={loading}>
          <Send className="h-4 w-4" />
          {t.digest.sendToday}
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        {digest ? (
          <>
            <div>
              <h3 className="text-sm font-semibold text-ink">{digest.title}</h3>
              <p className="mt-1 text-xs text-muted">{t.digest.generatedAt} {relativeTime(digest.generatedAt)}</p>
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
            {t.digest.empty}
          </div>
        )}
      </div>
    </section>
  );
}
