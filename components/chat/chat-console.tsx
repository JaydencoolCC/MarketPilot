"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

const prompts = [
  "今天我的自选股有什么重要变化？",
  "哪些新闻最值得我继续看？",
  "这份摘要里有哪些不确定性？",
];

export function ChatConsole() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好，我会基于你的自选股、行情快照和相关新闻回答。涉及价格时，我会说明数据时间；信息不足时，我会直接说清楚。",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(false);

  async function sendMessage(text = input) {
    const content = text.trim();
    if (!content) return;
    setInput("");
    setLoading(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message: string } };
        throw new Error(payload.error?.message ?? "模型暂时不可用，可以稍后重试。");
      }

      if (!response.body) {
        throw new Error("模型暂时不可用，可以稍后重试。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const nextChunk = decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== assistantMessage.id) return message;
            return { ...message, content: `${message.content}${nextChunk}` };
          }),
        );
      }
    } catch (error) {
      const fallback = error instanceof Error ? error.message : "模型暂时不可用，可以稍后重试。";
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: fallback } : message,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-8rem)] flex-col rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line p-4">
        <h2 className="text-lg font-semibold text-ink">金融研究助手</h2>
        <p className="mt-1 text-sm text-muted">回答会尽量给出结论、依据、数据时间、来源和不确定性。</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {message.role === "assistant" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moss/10 text-moss">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[78%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-6",
                message.role === "user"
                  ? "bg-ink text-white"
                  : "border border-line bg-surface/70 text-ink",
              )}
            >
              {message.content || "正在整理依据..."}
            </div>
            {message.role === "user" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-line p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <Button key={prompt} variant="secondary" size="sm" onClick={() => sendMessage(prompt)}>
              {prompt}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="问问今天的自选股、新闻或摘要"
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="发送">
            <ArrowUp className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </section>
  );
}
