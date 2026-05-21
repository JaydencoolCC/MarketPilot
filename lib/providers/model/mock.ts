import type { DigestPreview } from "@/lib/domain/types";
import type { ChatRequest, DigestPrompt, ModelProvider } from "@/lib/providers/model/types";

export class MockModelProvider implements ModelProvider {
  async generateDigest(input: DigestPrompt): Promise<DigestPreview> {
    const generatedAt = new Date().toISOString();
    const topArticles = input.articles.slice(0, 3);
    const movers = input.quotes
      .slice()
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 3);

    return {
      title: "今日重点财经摘要",
      generatedAt,
      sections: [
        {
          heading: "市场重点",
          body: topArticles.length
            ? topArticles.map((article) => article.summary).join(" ")
            : "过去 24 小时没有找到与自选股高度相关的重要新闻。",
          sources: topArticles.map((article) => ({
            title: article.title,
            url: article.url,
          })),
        },
        {
          heading: "自选股变化",
          body: movers.length
            ? movers
                .map(
                  (quote) =>
                    `${quote.symbol} 当前 ${quote.price} ${quote.currency}，涨跌幅 ${quote.changePercent.toFixed(2)}%，行情时间 ${new Date(
                      quote.quoteTime,
                    ).toLocaleString("zh-CN")}。`,
                )
                .join(" ")
            : "当前没有可用行情快照。",
        },
        {
          heading: "可以继续追问",
          body: "建议追问：今天我的自选股为什么波动？哪些新闻最值得关注？这些变化有哪些不确定性？",
        },
      ],
    };
  }

  async *streamChat(input: ChatRequest) {
    const topQuote = input.quotes
      .slice()
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
    const topArticle = input.articles[0];
    const quoteLine = topQuote
      ? `${topQuote.symbol} 当前涨跌幅 ${topQuote.changePercent.toFixed(2)}%，行情时间 ${new Date(
          topQuote.quoteTime,
        ).toLocaleString("zh-CN")}。`
      : "当前还没有可用行情快照。";
    const articleLine = topArticle
      ? `相关新闻来自 ${topArticle.source}：《${topArticle.title}》。`
      : "过去 24 小时没有找到高相关重要新闻。";
    const historyLine = input.history?.length
      ? `我也参考了最近 ${input.history.length} 条对话上下文。`
      : "当前没有可参考的历史对话。";

    const answer = [
      `我会先看价格变化有没有被新闻解释得上。“${input.question}” 这个问题，目前最值得盯的是价格波动和相关新闻是否互相印证。`,
      `${quoteLine}${articleLine}`,
      `${historyLine} 这只是基于当前系统上下文的快速判断，不是买卖建议；如果你要继续看，我会优先补财报、行业资金面和更长周期走势。`,
    ].join("\n\n");

    for (const part of answer.match(/.{1,28}/gs) ?? [answer]) {
      yield { content: part };
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}
