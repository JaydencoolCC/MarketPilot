"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ChatConsole } from "@/components/chat/chat-console";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { LocaleProvider, useLocale } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n";

export function ChatPageClient({ initialLocale }: { initialLocale: Locale }) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <ChatPageContent />
    </LocaleProvider>
  );
}

function ChatPageContent() {
  const { t } = useLocale();

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-4 md:px-6">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            {t.common.backDashboard}
          </Link>
          <LanguageToggle />
        </div>
        <header className="mb-4 mt-3">
          <p className="text-sm font-medium text-moss">{t.chat.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{t.chat.title}</h1>
        </header>
      </div>
      <div className="min-h-0 flex-1">
        <ChatConsole />
      </div>
    </main>
  );
}
