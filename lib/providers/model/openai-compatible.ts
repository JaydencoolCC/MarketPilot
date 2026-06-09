import type { DigestPreview } from "@/lib/domain/types";
import type { ChatRequest, DigestPrompt, ModelProvider } from "@/lib/providers/model/types";
import { modelEndpoint, type ResolvedModelConfig } from "@/lib/providers/model/config";
import { parseDigestResponse } from "@/lib/providers/model/digest-parser";

type OpenAIChatChoice = {
  message?: {
    content?: string;
  };
  delta?: {
    content?: string;
  };
};

type OpenAIChatResponse = {
  choices?: OpenAIChatChoice[];
};

export class OpenAICompatibleModelProvider implements ModelProvider {
  constructor(private readonly config: Required<Pick<ResolvedModelConfig, "baseUrl" | "apiKey" | "modelName">>) {}

  async generateDigest(input: DigestPrompt): Promise<DigestPreview> {
    const content = await this.complete([
      {
        role: "system",
        content:
          [
            "你是谨慎的中文财经研究助手。请基于用户提供的行情和新闻生成客观摘要，不给买卖建议。",
            "只返回 JSON，不要 Markdown、代码块或表格。",
            "JSON 格式：{\"title\":\"今日重点财经摘要\",\"sections\":[{\"heading\":\"行情速览\",\"body\":\"纯文本正文，可用换行分隔要点\",\"sources\":[{\"title\":\"来源标题\",\"url\":\"https://...\"}]}]}。",
            "“行情速览”只写 indexQuotes 里的主要股市指数，例如上证、标普500、纳斯达克、道琼斯、日经、TOPIX；不要在这个 section 列出个股。",
            "正文要短句、可读、中文。引用新闻时把来源放入 sources，body 中不要写裸链接。",
          ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "生成每日财经摘要",
          watchlist: input.watchlist,
          quotes: input.quotes,
          indexQuotes: input.indexQuotes,
          articles: input.articles,
        }),
      },
    ]);
    const parsed = parseDigestResponse(content);

    if (parsed) {
      return parsed;
    }

    return {
      title: "今日重点财经摘要",
      generatedAt: new Date().toISOString(),
      sections: [
        {
          heading: "AI 摘要",
          body: content || "模型没有返回有效摘要，可以稍后重试。",
        },
      ],
    };
  }

  async *streamChat(input: ChatRequest) {
    const response = await fetch(modelEndpoint(this.config.baseUrl), {
      method: "POST",
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.modelName,
        stream: true,
        messages: [
          {
            role: "system",
            content: "你是一个中文金融研究助手。",
          },
          {
            role: "user",
            content: JSON.stringify({
              question: input.question,
              context: input.context,
              watchlist: input.watchlist,
              quotes: input.quotes,
              articles: input.articles,
              history: input.history ?? [],
            }),
          },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`模型请求失败，状态码 ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const filterThinkTags = createThinkTagFilter();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const content = filterThinkTags("", true);
        if (content) yield { content };
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.replace(/^data:\s*/, "");
        if (data === "[DONE]") {
          const content = filterThinkTags("", true);
          if (content) yield { content };
          return;
        }
        try {
          const parsed = JSON.parse(data) as OpenAIChatResponse;
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            const visibleContent = filterThinkTags(content);
            if (visibleContent) yield { content: visibleContent };
          }
        } catch {
          continue;
        }
      }
    }
  }

  private async complete(messages: Array<{ role: "system" | "user"; content: string }>) {
    const response = await fetch(modelEndpoint(this.config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.modelName,
        stream: false,
        temperature: 0.2,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`模型请求失败，状态码 ${response.status}`);
    }

    const payload = (await response.json()) as OpenAIChatResponse;
    return payload.choices?.[0]?.message?.content ?? "";
  }
}

function createThinkTagFilter() {
  const openTag = "<think>";
  const closeTag = "</think>";
  const holdBack = Math.max(openTag.length, closeTag.length) - 1;
  let pending = "";
  let insideThink = false;

  return (chunk: string, flush = false) => {
    const text = pending + chunk;
    const limit = flush ? text.length : Math.max(0, text.length - holdBack);
    let output = "";
    let index = 0;

    while (index < limit) {
      const rest = text.slice(index).toLowerCase();
      if (!insideThink && rest.startsWith(openTag)) {
        insideThink = true;
        index += openTag.length;
        continue;
      }
      if (insideThink && rest.startsWith(closeTag)) {
        insideThink = false;
        index += closeTag.length;
        continue;
      }
      if (!insideThink) output += text[index];
      index += 1;
    }

    pending = flush ? "" : text.slice(index);
    return output;
  };
}
