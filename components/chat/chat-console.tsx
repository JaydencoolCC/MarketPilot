"use client";

import { useEffect, useRef, useState } from "react";
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-white shadow-soft">
      <div className="shrink-0 border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold text-ink">金融研究助手</h2>
        <p className="mt-1 text-sm text-muted">直接问就行，我会先讲人话，再补关键数据和风险。</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
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
                "max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 md:max-w-[78%]",
                message.role === "user"
                  ? "bg-ink text-white"
                  : "border border-line bg-surface/70 text-ink",
              )}
            >
              {message.content ? (
                message.role === "assistant" ? (
                  <MarkdownMessage content={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )
              ) : (
                "正在整理依据..."
              )}
            </div>
            {message.role === "user" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-white px-4 py-3">
        <div className="mx-auto max-w-3xl">
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
      </div>
    </section>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = block.level === 2 ? "h3" : "h4";
          return (
            <Heading key={index} className="font-semibold leading-7 text-ink">
              {renderInline(block.text)}
            </Heading>
          );
        }

        if (block.type === "list") {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "table") {
          return (
            <div key={index} className="overflow-x-auto rounded-md border border-line bg-white">
              <table className="min-w-full border-collapse text-left text-sm">
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-line last:border-b-0">
                      {row.map((cell, cellIndex) => {
                        const Cell = rowIndex === 0 ? "th" : "td";
                        return (
                          <Cell key={cellIndex} className="px-3 py-2 align-top">
                            {renderInline(cell)}
                          </Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "divider") {
          return <div key={index} className="h-px bg-line" />;
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "divider" }
  | { type: "paragraph"; text: string };

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{2,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: Math.min(heading[1].length, 4) as 2 | 3 | 4,
        text: heading[2],
      });
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "divider" });
      continue;
    }

    if (isTableRow(trimmed) && isTableSeparator(lines[index + 1]?.trim() ?? "")) {
      flushParagraph();
      const rows = [parseTableRow(trimmed)];
      index += 2;
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(parseTableRow(lines[index].trim()));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", rows });
      continue;
    }

    const listItems: string[] = [];
    while (index < lines.length) {
      const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(lines[index]);
      if (!item) break;
      listItems.push(item[1]);
      index += 1;
    }
    if (listItems.length) {
      flushParagraph();
      index -= 1;
      blocks.push({ type: "list", items: listItems });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

function isTableRow(line: string) {
  return line.startsWith("|") && line.endsWith("|") && line.split("|").length > 2;
}

function isTableSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function parseTableRow(line: string) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
