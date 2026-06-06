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
          [
            "你是谨慎的中文财经研究助手。请基于用户提供的行情和新闻生成客观摘要，不给买卖建议。",
            "只返回 JSON，不要 Markdown、代码块或表格。",
            "JSON 格式：{\"title\":\"今日重点财经摘要\",\"sections\":[{\"heading\":\"行情速览\",\"body\":\"纯文本正文，可用换行分隔要点\",\"sources\":[{\"title\":\"来源标题\",\"url\":\"https://...\"}]}]}。",
            "正文要短句、可读、中文。引用新闻时把来源放入 sources，body 中不要写裸链接。",
          ].join("\n"),
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
            content:
              [
                "你是一个会聊天的中文金融研究助手，不是报告模板生成器。",
                "先用 2-4 句话直接回答用户真正问的问题，语气自然、具体、克制。",
                "再按需要补充简短依据：行情变化、相关新闻、数据时间和不确定性。不要机械套用“结论/依据/来源/不确定性”的固定标题。",
                "当前日期、时间和时区只能以用户消息里的 context 为准；不要根据新闻或行情时间自行推断今天。",
                "只有当行情 quoteTime/fetchedAt 或新闻 publishedAt 按 context.timezone 换算后的日期等于 context.today，才可以称为“今天”。",
                "如果最新行情或新闻不是 context.today 的数据，要明确说“最新数据时间是……，不是今天实时数据”或“这是上一交易日/较早信息”。",
                "如果没有同日新闻或同日行情依据，不要编造今日原因；直接说明当前上下文没有今天的新证据。",
                "只有在数据对比明显有帮助时才使用表格；不要为了格式而使用表格。",
                "不要判断该不该买、卖、补仓或持有；可以改成提示用户关注哪些条件、风险和后续验证点。信息不足时直接说明缺什么。",
                "只能使用用户消息中提供的 watchlist、quotes、articles 和 history，不要编造公告、新闻、价格、日期或来源。",
              ].join("\n"),
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

function parseDigestResponse(content: string): DigestPreview | null {
  const payload = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(payload) as Partial<DigestPreview>;
    if (!parsed.title || !Array.isArray(parsed.sections)) {
      return null;
    }

    const sections = parsed.sections
      .filter((section) => section?.heading && section?.body)
      .map((section) => ({
        heading: String(section.heading),
        body: String(section.body),
        sources: Array.isArray(section.sources)
          ? section.sources
              .filter((source) => source?.title && source?.url)
              .map((source) => ({
                title: String(source.title),
                url: String(source.url),
              }))
          : undefined,
      }));

    if (sections.length === 0) {
      return null;
    }

    return {
      title: String(parsed.title),
      generatedAt: new Date().toISOString(),
      sections,
    };
  } catch {
    return null;
  }
}
