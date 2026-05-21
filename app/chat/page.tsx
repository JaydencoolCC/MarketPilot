import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ChatConsole } from "@/components/chat/chat-console";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-4 md:px-6">
      <div className="shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          返回 Dashboard
        </Link>
        <header className="mb-4 mt-3">
          <p className="text-sm font-medium text-moss">Chat</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">把价格和新闻串起来问</h1>
        </header>
      </div>
      <div className="min-h-0 flex-1">
        <ChatConsole />
      </div>
    </main>
  );
}
