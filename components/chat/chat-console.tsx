"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, Bot, Square, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/i18n/locale-provider";
import type { ChatMessage } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { localizedApiMessage } from "@/lib/i18n";

export function ChatConsole() {
  const { locale, t } = useLocale();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: t.chat.welcome,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setMessages((current) =>
      current.map((message) =>
        message.id === "welcome" ? { ...message, content: t.chat.welcome } : message,
      ),
    );
  }, [t.chat.welcome]);

  async function sendMessage(text = input) {
    const content = text.trim();
    if (!content) return;
    if (sendingRef.current) return;
    sendingRef.current = true;
    setInput("");
    setLoading(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);

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
    const history = messages
      .filter((message) => message.id !== "welcome" && message.content.trim())
      .slice(-8);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message: string } };
        throw new Error(localizedApiMessage(locale, payload.error?.message, t.chat.unavailable));
      }

      if (!response.body) {
        throw new Error(t.chat.unavailable);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receivedContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          const rest = decoder.decode();
          if (rest) {
            receivedContent += rest;
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantMessage.id) return message;
                return { ...message, content: `${message.content}${rest}` };
              }),
            );
          }
          if (!receivedContent.trim()) {
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantMessage.id) return message;
                return { ...message, content: t.chat.emptyResponse };
              }),
            );
          }
          break;
        }
        const nextChunk = decoder.decode(value, { stream: true });
        receivedContent += nextChunk;
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== assistantMessage.id) return message;
            return { ...message, content: `${message.content}${nextChunk}` };
          }),
        );
      }
    } catch (error) {
      const fallback = isAbortError(error)
        ? t.chat.stopped
        : error instanceof Error
          ? error.message
          : t.chat.unavailable;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: message.content ? `${message.content}\n\n${fallback}` : fallback }
            : message,
        ),
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      sendingRef.current = false;
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function stopResponse() {
    abortControllerRef.current?.abort();
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-white shadow-soft">
      <div className="shrink-0 border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold text-ink">{t.chat.assistantTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.chat.subtitle}</p>
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
                t.chat.thinking
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
          {t.chat.prompts.map((prompt) => (
            <Button key={prompt} variant="secondary" size="sm" disabled={loading} onClick={() => sendMessage(prompt)}>
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
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t.chat.placeholder}
          />
          {loading ? (
            <Button type="button" size="icon" aria-label={t.chat.stop} onClick={stopResponse}>
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label={t.chat.send}>
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </form>
        </div>
      </div>
    </section>
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
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
