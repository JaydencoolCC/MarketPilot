import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SettingsCenter } from "@/components/settings/settings-center";
import { getEmailSetting, listPublicIntegrations } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const setting = await getEmailSetting();
  const integrations = await listPublicIntegrations();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-5 md:px-6 lg:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        返回 Dashboard
      </Link>
      <header className="mb-5 mt-4">
        <p className="text-sm font-medium text-moss">设置</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink md:text-3xl">连接服务，保留你的节奏</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          API Key 可以在这里配置，但不会回显完整内容；没有真实服务时，系统会继续使用 mock provider。
        </p>
      </header>
      <SettingsCenter initialEmailSetting={setting} initialIntegrations={integrations} />
    </main>
  );
}
