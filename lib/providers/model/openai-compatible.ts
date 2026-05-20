import type { DigestPreview } from "@/lib/domain/types";
import type { ChatRequest, DigestPrompt, ModelProvider } from "@/lib/providers/model/types";
import { modelEndpoint, type ResolvedModelConfig } from "@/lib/providers/model/config";

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
          "你是谨慎的中文财经研究助手。请基于用户提供的行情和新闻生成客观摘要，不给买卖建议。",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "生成每日财经摘要",
          watchlist: input.watchlist,
          quotes: input.quotes,
          articles: input.articles,
        }),
      },
    ]);

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
            content:
              "你是中文金融研究助手。回答必须包含：结论、依据、数据时间、来源、不确定性。不要给确定性买卖建议。",
          },
          {
            role: "user",
            content: JSON.stringify({
              question: input.question,
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.replace(/^data:\s*/, "");
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as OpenAIChatResponse;
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield { content };
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
