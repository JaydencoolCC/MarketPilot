import { cookies } from "next/headers";
import { ChatPageClient } from "@/components/chat/chat-page-client";
import { defaultLocale, isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const cookieLocale = (await cookies()).get("marketpilot-locale")?.value;

  return <ChatPageClient initialLocale={isLocale(cookieLocale) ? cookieLocale : defaultLocale} />;
}
