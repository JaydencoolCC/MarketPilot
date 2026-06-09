"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SettingsCenter } from "@/components/settings/settings-center";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { LocaleProvider, useLocale } from "@/components/i18n/locale-provider";
import type { EmailDigestSetting, PublicIntegrationSetting } from "@/lib/domain/types";
import type { Locale } from "@/lib/i18n";
import type { getMarketDataNetworkSetting } from "@/lib/providers/market-data-network";

type SettingsPageClientProps = {
  initialLocale: Locale;
  initialEmailSetting: EmailDigestSetting;
  initialIntegrations: PublicIntegrationSetting[];
  initialMarketDataNetwork: ReturnType<typeof getMarketDataNetworkSetting>;
};

export function SettingsPageClient(props: SettingsPageClientProps) {
  return (
    <LocaleProvider initialLocale={props.initialLocale}>
      <SettingsPageContent {...props} />
    </LocaleProvider>
  );
}

function SettingsPageContent({
  initialEmailSetting,
  initialIntegrations,
  initialMarketDataNetwork,
}: SettingsPageClientProps) {
  const { t } = useLocale();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-5 md:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          {t.common.backDashboard}
        </Link>
        <LanguageToggle />
      </div>
      <header className="mb-5 mt-4">
        <p className="text-sm font-medium text-moss">{t.common.settings}</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink md:text-3xl">{t.settings.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {t.settings.description}
        </p>
      </header>
      <SettingsCenter
        initialEmailSetting={initialEmailSetting}
        initialIntegrations={initialIntegrations}
        initialMarketDataNetwork={initialMarketDataNetwork}
      />
    </main>
  );
}
