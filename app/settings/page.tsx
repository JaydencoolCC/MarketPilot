import { cookies } from "next/headers";
import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { getEmailSetting, listPublicIntegrations } from "@/lib/db/store";
import { defaultLocale, isLocale } from "@/lib/i18n";
import { getMarketDataNetworkSetting } from "@/lib/providers/market-data-network";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const setting = await getEmailSetting();
  const integrations = await listPublicIntegrations();
  const marketDataNetwork = getMarketDataNetworkSetting();
  const cookieLocale = (await cookies()).get("marketpilot-locale")?.value;

  return (
    <SettingsPageClient
      initialLocale={isLocale(cookieLocale) ? cookieLocale : defaultLocale}
      initialEmailSetting={setting}
      initialIntegrations={integrations}
      initialMarketDataNetwork={marketDataNetwork}
    />
  );
}
