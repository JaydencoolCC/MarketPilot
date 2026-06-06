"use client";

import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

export function ChatPreview() {
  const { t } = useLocale();

  return (
    <section className="rounded-lg border border-line bg-ink p-4 text-white shadow-soft">
      <div className="flex items-center gap-2 text-sm font-medium text-white/75">
        <MessageCircle className="h-4 w-4" />
        {t.chatPreview.eyebrow}
      </div>
      <h2 className="mt-3 text-lg font-semibold">{t.chatPreview.title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/70">
        {t.chatPreview.body}
      </p>
      <div className="mt-4 space-y-2 text-sm text-white/80">
        <div className="rounded-md bg-white/8 p-3">{t.chatPreview.prompt1}</div>
        <div className="rounded-md bg-white/8 p-3">{t.chatPreview.prompt2}</div>
      </div>
      <Link
        href="/chat"
        className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-ink hover:bg-white/90"
      >
        <Send className="h-4 w-4" />
        {t.chatPreview.open}
      </Link>
    </section>
  );
}
