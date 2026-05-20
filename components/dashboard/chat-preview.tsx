"use client";

import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";

export function ChatPreview() {
  return (
    <section className="rounded-lg border border-line bg-ink p-4 text-white shadow-soft">
      <div className="flex items-center gap-2 text-sm font-medium text-white/75">
        <MessageCircle className="h-4 w-4" />
        金融研究助手
      </div>
      <h2 className="mt-3 text-lg font-semibold">继续追问今天的变化</h2>
      <p className="mt-2 text-sm leading-6 text-white/70">
        Chat 会结合自选股、行情快照和最近新闻回答，并说明数据时间和不确定性。
      </p>
      <div className="mt-4 space-y-2 text-sm text-white/80">
        <div className="rounded-md bg-white/8 p-3">今天我的自选股有什么重要变化？</div>
        <div className="rounded-md bg-white/8 p-3">哪些新闻最值得我继续看？</div>
      </div>
      <Link
        href="/chat"
        className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-ink hover:bg-white/90"
      >
        <Send className="h-4 w-4" />
        打开 Chat
      </Link>
    </section>
  );
}
