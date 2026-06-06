"use client";

import { Globe2 } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

const options: Array<{ locale: Locale; label: string }> = [
  { locale: "zh", label: "中" },
  { locale: "en", label: "EN" },
];

export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-white px-1.5 text-sm shadow-sm"
      aria-label={t.common.languageLabel}
    >
      <Globe2 className="ml-1 h-4 w-4 text-muted" />
      <div className="mx-1 h-4 w-px bg-line" />
      {options.map((option) => {
        const selected = locale === option.locale;
        return (
          <button
            key={option.locale}
            type="button"
            aria-pressed={selected}
            aria-label={option.locale === "zh" ? t.common.chinese : t.common.english}
            onClick={() => setLocale(option.locale)}
            className={cn(
              "h-7 min-w-9 rounded px-2 text-xs font-semibold transition",
              selected
                ? "bg-ink text-white shadow-sm"
                : "text-muted hover:bg-moss/5 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
