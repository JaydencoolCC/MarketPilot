export type Locale = "zh" | "en";
type LocaleText = string;

export type Dictionary = {
  common: {
    settings: LocaleText;
    backDashboard: LocaleText;
    languageLabel: LocaleText;
    chinese: LocaleText;
    english: LocaleText;
  };
  dashboard: {
    productLabel: LocaleText;
    globalRefresh: LocaleText;
    subtitles: Record<"stocks" | "funds" | "gold" | "holdings", (provider: string) => string>;
  };
  nav: Record<"stocks" | "holdings" | "funds" | "gold", LocaleText>;
  digest: Record<
    | "initialStatus"
    | "loadingPreview"
    | "previewFailed"
    | "previewReady"
    | "sendingTest"
    | "testFailed"
    | "testSent"
    | "sendingDaily"
    | "dailyFailed"
    | "dailyDone"
    | "eyebrow"
    | "title"
    | "preview"
    | "testSend"
    | "sendToday"
    | "generatedAt"
    | "empty",
    LocaleText
  >;
  chatPreview: Record<"eyebrow" | "title" | "body" | "prompt1" | "prompt2" | "open", LocaleText>;
  chat: {
    eyebrow: LocaleText;
    title: LocaleText;
    assistantTitle: LocaleText;
    subtitle: LocaleText;
    welcome: LocaleText;
    prompts: string[];
    placeholder: LocaleText;
    thinking: LocaleText;
    emptyResponse: LocaleText;
    stopped: LocaleText;
    unavailable: LocaleText;
    send: LocaleText;
    stop: LocaleText;
  };
};

export const defaultLocale: Locale = "zh";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "zh" || value === "en";
}

export const dictionary: Record<Locale, Dictionary> = {
  zh: {
    common: {
      settings: "设置",
      backDashboard: "返回 Dashboard",
      languageLabel: "界面语言",
      chinese: "中文",
      english: "EN",
    },
    dashboard: {
      productLabel: "MarketPilot · 个人 AI 金融信息工作台",
      globalRefresh: "全局刷新时间",
      subtitles: {
        stocks: (provider: string) => `当前行情来源：${provider}，行情可能有延迟`,
        funds: (provider: string) => `当前基金来源：${provider}，ETF 行情复用真实行情源`,
        gold: (provider: string) => `当前黄金来源：${provider}，国内金价为人民币/克参考折算`,
        holdings: (provider: string) => `持仓按股票和基金本币计算，当前行情来源：${provider}`,
      },
    },
    nav: {
      stocks: "股票",
      holdings: "持仓",
      funds: "基金",
      gold: "黄金",
    },
    digest: {
      initialStatus: "我会在发送前整理重点新闻和自选股变化。",
      loadingPreview: "正在整理今日重点。",
      previewFailed: "摘要生成失败，可以稍后重试。",
      previewReady: "摘要已生成，真实邮件 provider 接入后可按时发送。",
      sendingTest: "正在模拟发送测试邮件。",
      testFailed: "测试邮件发送失败。",
      testSent: "测试邮件已模拟发送。",
      sendingDaily: "正在发送今日摘要。",
      dailyFailed: "今日摘要发送失败。",
      dailyDone: "今日摘要已处理。",
      eyebrow: "今日重点",
      title: "每日摘要预览",
      preview: "预览摘要",
      testSend: "测试发送",
      sendToday: "发送今日",
      generatedAt: "生成于",
      empty: "过去 24 小时的重点会在这里预览。没有新闻时，我会直接告诉你，而不是编造摘要。",
    },
    chatPreview: {
      eyebrow: "金融研究助手",
      title: "继续追问今天的变化",
      body: "Chat 会结合自选股、行情快照和最近新闻回答，并说明数据时间和不确定性。",
      prompt1: "今天我的自选股有什么重要变化？",
      prompt2: "哪些新闻最值得我继续看？",
      open: "打开 Chat",
    },
    chat: {
      eyebrow: "Chat",
      title: "把价格和新闻串起来问",
      assistantTitle: "金融研究助手",
      subtitle: "直接问就行，我会先讲人话，再补关键数据和风险。",
      welcome: "你好，我会基于你的自选股、行情快照和相关新闻回答。涉及价格时，我会说明数据时间；信息不足时，我会直接说清楚。",
      prompts: ["今天我的自选股有什么重要变化？", "哪些新闻最值得我继续看？", "这份摘要里有哪些不确定性？"],
      placeholder: "问问今天的自选股、新闻或摘要",
      thinking: "正在整理依据...",
      emptyResponse: "模型没有返回内容，可以换个问法再试一次。",
      stopped: "已停止生成。",
      unavailable: "模型暂时不可用，可以稍后重试。",
      send: "发送",
      stop: "停止生成",
    },
  },
  en: {
    common: {
      settings: "Settings",
      backDashboard: "Back to Dashboard",
      languageLabel: "Language",
      chinese: "中文",
      english: "EN",
    },
    dashboard: {
      productLabel: "MarketPilot · Personal AI finance workspace",
      globalRefresh: "Global refresh",
      subtitles: {
        stocks: (provider: string) => `Quote source: ${provider}. Prices may be delayed`,
        funds: (provider: string) => `Fund source: ${provider}. ETF prices use the live quote provider`,
        gold: (provider: string) => `Gold source: ${provider}. Domestic gold is a CNY/gram reference`,
        holdings: (provider: string) => `Holdings use each asset currency. Quote source: ${provider}`,
      },
    },
    nav: {
      stocks: "Stocks",
      holdings: "Holdings",
      funds: "Funds",
      gold: "Gold",
    },
    digest: {
      initialStatus: "I will prepare key news and watchlist moves before sending.",
      loadingPreview: "Preparing today's highlights.",
      previewFailed: "Digest generation failed. Please try again later.",
      previewReady: "Digest generated. It can be sent on schedule after a real email provider is connected.",
      sendingTest: "Sending a test email.",
      testFailed: "Test email failed.",
      testSent: "Test email sent.",
      sendingDaily: "Sending today's digest.",
      dailyFailed: "Today's digest failed.",
      dailyDone: "Today's digest has been handled.",
      eyebrow: "Highlights",
      title: "Daily Digest Preview",
      preview: "Preview",
      testSend: "Test Send",
      sendToday: "Send Today",
      generatedAt: "Generated",
      empty: "Key items from the past 24 hours will appear here. If there is no news, I will say so directly.",
    },
    chatPreview: {
      eyebrow: "Research Assistant",
      title: "Follow Up On Today's Moves",
      body: "Chat combines your watchlist, quote snapshots, and recent news, with data times and uncertainty.",
      prompt1: "What changed most in my watchlist today?",
      prompt2: "Which news should I keep reading?",
      open: "Open Chat",
    },
    chat: {
      eyebrow: "Chat",
      title: "Ask Across Prices And News",
      assistantTitle: "Research Assistant",
      subtitle: "Ask directly. I will answer plainly first, then add key data and risks.",
      welcome: "Hi, I answer using your watchlist, quote snapshots, and related news. When prices are involved, I will mention data times; when context is missing, I will say so.",
      prompts: ["What changed most in my watchlist today?", "Which news should I keep reading?", "What is uncertain in this summary?"],
      placeholder: "Ask about today's watchlist, news, or digest",
      thinking: "Gathering context...",
      emptyResponse: "The model returned no content. Try asking another way.",
      stopped: "Generation stopped.",
      unavailable: "The model is unavailable. Please try again later.",
      send: "Send",
      stop: "Stop generation",
    },
  },
};
