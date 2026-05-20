# 个人 AI 金融信息工作台产品/技术开发文档 v0.2

## 1. 产品定位

本项目是一个个人自用的 AI 金融信息工作台，用来集中管理关注股票、查看准实时行情、接收每日重点财经资讯邮件，并通过 Chat 追问和分析自选股相关信息。

第一版不是券商交易终端，也不是投资组合记账工具。它的核心价值是把分散的价格、新闻、摘要和问答整合成一个清爽、可靠、可追溯的个人金融助手。

核心闭环：

1. 添加美股、港股、A股自选股票。
2. 在 Dashboard 查看准实时价格、涨跌、更新时间和相关新闻。
3. 每天按配置时间收到重点财经资讯邮件。
4. 通过 Chat 基于自选股、行情和新闻继续追问。

第一版必须坚持：

- 个人自用优先。
- Watchlist-first，而不是交易-first。
- 准实时行情，不伪装交易级实时数据。
- AI 回答要有依据、时间和来源。
- 界面美观、拟人、易用、精简。
- 不做交易下单、确定性买卖建议、多用户 SaaS 或计费系统。

## 2. 竞品与趋势调研

调研日期：2026-05-19。

参考产品和可借鉴点：

- [TradingView](https://www.tradingview.com/features/)：watchlist、图表、筛选器、价格提醒和多市场信息组织成熟。可借鉴其“自选股是第一入口”的产品结构。
- [Koyfin](https://www.koyfin.com/features/watchlists/)：强调自定义 watchlist columns、新闻和市场数据看板。可借鉴其清爽、可扫描的金融表格。
- [Fiscal.ai](https://fiscal.ai/)：强调公司研究页、指标和 AI 辅助研究。可借鉴其“问答围绕资产和证据展开”的体验。
- [Perplexity Finance](https://docs.perplexity.ai/docs/agent-api/finance-search)：体现 AI 金融问答需要结构化行情、财务、新闻、估值和来源引用。可借鉴其回答可追溯的模式。
- [Longbridge / LongPort OpenAPI](https://open.longbridge.com/docs)：适合美股、港股、A股行情接入，适合作为第一版主行情 provider。
- Moomoo、富途等券商类产品：AI agent 化和自动化趋势明显，但交易执行、账户资产和风控不是本 MVP 范围。

对本项目的设计结论：

- 首页不做营销页，打开后直接进入 Dashboard。
- 第一屏只放最有用的信息：自选股、今日重点、Chat 入口。
- AI 不是泛聊天工具，而是带上下文的金融研究助手。
- 所有外部能力都走 provider adapter，避免被单一供应商锁死。
- mock provider 必须是一等实现，保证没有真实 API key 时也能开发和测试。

## 3. MVP 范围

### 3.1 包含功能

自选股管理：

- 添加、删除、查看自选股票。
- 支持市场：美股、港股、A股。
- 标准化股票代码，例如 `AAPL.US`、`700.HK`、`600519.SH`。
- 展示名称、代码、市场、价格、涨跌额、涨跌幅、更新时间、市场状态和数据状态。

准实时行情：

- 后端按需或定时刷新自选股行情。
- 前端每 30-60 秒刷新视图。
- 数据过期、行情失败或权限不足时显示明确状态。
- 永远显示行情更新时间，不把过期数据伪装成实时数据。

每日财经邮件：

- 用户可配置启用状态、收件邮箱、发送时间、时区和关注市场。
- 默认时区为 `Asia/Shanghai`。
- 邮件发送前收集最近 24 小时重点新闻。
- 使用模型生成中文摘要。
- 支持手动预览摘要和发送测试邮件。

Chat 问答：

- 接入用户提供的 OpenAI-compatible API。
- 支持流式响应。
- 注入自选股、行情快照、最近新闻和历史对话上下文。
- 回答必须包含数据时间和来源，不输出确定性买卖建议。

### 3.2 不包含功能

第一版不做：

- 股票交易下单。
- 券商账户接入。
- 持仓盈亏和复杂组合分析。
- 多用户、租户隔离或团队协作。
- 计费系统。
- 高频交易级实时行情。
- 自动交易或代替用户做投资决策。

## 4. UI/UX 设计要求

### 4.1 总体风格

界面必须美观、现代、克制、拟人、易用、精简。目标不是制造复杂交易终端，而是做一个让个人每天愿意打开的金融助手。

设计原则：

- 清爽：默认只展示关键指标，避免堆砌过多金融字段。
- 可扫描：表格行高、字体层级和颜色状态要适合快速浏览。
- 拟人：文案像一个懂金融的助理，清楚、自然、不机械。
- 克制：不用夸张渐变、大面积装饰或营销式 hero。
- 可靠：任何数据都要能看到更新时间和状态。
- 直接：主要操作在 1-2 步内完成。

### 4.2 页面布局

Dashboard 是首屏，不做 landing page。

首屏结构：

- 顶部：产品名、全局更新时间、设置入口。
- 主区域：自选股表格，占据最大空间。
- 侧栏或右侧区域：今日重点摘要和 Chat 快捷入口。
- 空状态：引导用户添加第一只股票。

自选股表格列：

- 名称
- 代码
- 市场
- 当前价格
- 涨跌幅
- 更新时间
- 市场状态
- 今日新闻数
- 数据状态

详情抽屉：

- 最新行情摘要。
- 最近相关新闻。
- 数据来源和更新时间。
- 快捷追问按钮，例如“这只股票今天为什么波动？”

设置页：

- 作为服务连接与个人偏好中心，包含连接状态、AI Chat、每日邮件、行情与新闻、安全说明。
- AI Chat 可配置 OpenAI-compatible `Base URL`、模型名称和 API Key。
- API Key 由后端加密保存，前端只显示脱敏状态，不回显完整密钥。
- 每日邮件只保留必要字段：启用、收件邮箱、发送时间、时区、市场范围、只看自选股、预览、测试发送。
- 保存、测试、删除密钥后都要给出明确反馈。
- 邮件或模型失败时显示可理解原因，例如“SMTP 登录失败”或“模型连接测试失败”。

Chat 页面：

- 像研究助理，而不是普通闲聊窗口。
- 输入框提供与当前自选股相关的快捷问题。
- 回答结构固定为：结论、依据、数据时间、来源、不确定性。
- 如果上下文不足，直接说明缺少哪些信息。

### 4.3 状态与文案

空状态示例：

- “还没有自选股。添加第一只股票后，我会开始整理价格、新闻和每日摘要。”

行情失败示例：

- “行情暂时不可用，当前显示的是上次成功更新的数据。”

新闻为空示例：

- “过去 24 小时没有找到与自选股高度相关的重要新闻。”

模型失败示例：

- “摘要生成失败。行情和新闻已保存，可以稍后重试。”

禁止出现：

- 原始技术堆栈错误直接展示给用户。
- 无依据的投资建议。
- 没有更新时间的价格。
- 冗长、营销化、难操作的首页。

## 5. 推荐技术架构

### 5.1 技术栈

- 前端：Next.js + TypeScript + React
- UI：Tailwind CSS + shadcn/ui
- 后端：Next.js Route Handlers
- 数据库：PostgreSQL
- ORM：Prisma
- 定时任务：Node worker + cron
- 邮件：Nodemailer SMTP
- 模型接口：OpenAI-compatible API
- 本地开发：Docker Compose
- 开发环境：conda 环境 `trade`

### 5.2 推荐目录结构

```text
app/
  api/
  chat/
  settings/
  watchlist/
components/
  dashboard/
  watchlist/
  chat/
  settings/
lib/
  providers/
    quotes/
    news/
    email/
    model/
  jobs/
  db/
  domain/
  utils/
prisma/
  schema.prisma
tests/
  unit/
  integration/
  e2e/
```

### 5.3 架构原则

- 外部服务全部通过 provider adapter 接入。
- 每个 provider 都必须有 mock 实现和真实实现。
- 前端不直接访问行情、邮件、新闻或模型密钥。
- 后端统一处理鉴权、错误归一化、重试和日志。
- 数据库保存最后成功快照，前端展示数据状态。
- worker 任务必须可重试、可观测、幂等。

## 6. Provider 策略

### 6.1 QuoteProvider

主实现建议使用 Longbridge / LongPort OpenAPI，开发期使用 mock provider。

接口：

```ts
interface QuoteProvider {
  getQuotes(symbols: string[]): Promise<Quote[]>;
  searchSymbols(keyword: string, market?: Market): Promise<Security[]>;
}
```

要求：

- 支持 `US`、`HK`、`CN` 三类市场。
- 返回价格、涨跌、涨跌幅、币种、市场状态、行情时间和 provider 名称。
- 权限不足、速率限制、symbol 不存在要返回结构化错误。
- mock provider 内置 `AAPL.US`、`700.HK`、`600519.SH` 示例数据。

### 6.2 NewsProvider

第一版可组合使用 Alpha Vantage News Sentiment、GDELT、RSS 或其他公开新闻源。所有来源必须统一转换为内部 `NewsArticle`。

接口：

```ts
interface NewsProvider {
  fetchMarketNews(input: NewsQuery): Promise<NewsArticle[]>;
}
```

要求：

- 按自选股相关性、时效性、来源可信度和重复度排序。
- 去重相同 URL 和高度相似标题。
- 新闻为空不是错误，应显示友好空状态。

### 6.3 EmailProvider

第一版使用 Nodemailer SMTP。

接口：

```ts
interface EmailProvider {
  sendDigest(input: DigestEmail): Promise<EmailSendResult>;
}
```

要求：

- 支持发送测试邮件。
- 支持 HTML 和纯文本降级。
- 失败时不暴露 SMTP 密码或完整连接串。

### 6.4 ModelProvider

使用 OpenAI-compatible API。

接口：

```ts
interface ModelProvider {
  streamChat(input: ChatRequest): AsyncIterable<ChatChunk>;
  generateDigest(input: DigestPrompt): Promise<DigestResult>;
}
```

要求：

- 后端代理模型请求，前端不接触完整 `MODEL_API_KEY`。
- 模型配置优先读取加密保存的页面配置；没有完整页面配置时 fallback 到 `.env`；都没有时使用 mock provider。
- 支持流式 Chat。
- 模型失败时保留已抓取行情和新闻，允许用户重试摘要生成。

## 7. 数据模型

### 7.1 WatchlistItem

保存自选股。

关键字段：

- `id`
- `symbol`
- `normalizedSymbol`
- `market`
- `name`
- `currency`
- `createdAt`
- `updatedAt`

约束：

- `normalizedSymbol` 唯一。
- `market` 只能是 `US`、`HK`、`CN`。

### 7.2 QuoteSnapshot

保存行情快照。

关键字段：

- `id`
- `watchlistItemId`
- `symbol`
- `price`
- `change`
- `changePercent`
- `currency`
- `marketStatus`
- `provider`
- `quoteTime`
- `createdAt`
- `errorCode`
- `errorMessage`

### 7.3 NewsArticle

保存新闻。

关键字段：

- `id`
- `title`
- `summary`
- `url`
- `source`
- `symbols`
- `market`
- `publishedAt`
- `importanceScore`
- `createdAt`

约束：

- `url` 唯一。
- `importanceScore` 用于邮件摘要排序。

### 7.4 EmailDigestSetting

保存邮件配置。

关键字段：

- `id`
- `enabled`
- `recipientEmail`
- `sendTime`
- `timezone`
- `markets`
- `watchlistOnly`
- `createdAt`
- `updatedAt`

### 7.5 NewsDigest

保存每日摘要。

关键字段：

- `id`
- `date`
- `recipientEmail`
- `title`
- `content`
- `articleIds`
- `emailStatus`
- `sentAt`
- `createdAt`

幂等要求：

- 同一 `date + recipientEmail` 只能成功发送一次，除非用户手动测试发送。

### 7.6 ChatSession / ChatMessage

保存 Chat 历史。

关键字段：

- `sessionId`
- `role`
- `content`
- `metadata`
- `createdAt`

### 7.7 JobRun

记录后台任务执行状态。

关键字段：

- `id`
- `jobType`
- `status`
- `startedAt`
- `finishedAt`
- `errorCode`
- `errorMessage`

### 7.8 IntegrationSetting

保存服务连接配置。

关键字段：

- `id`
- `kind`
- `provider`
- `baseUrl`
- `modelName`
- `encryptedSecret`
- `secretPreview`
- `lastTestStatus`
- `lastTestMessage`
- `lastTestedAt`
- `createdAt`
- `updatedAt`

要求：

- `encryptedSecret` 只保存 AES-GCM 密文。
- 前端 API 永不返回原始 secret。
- Chat API Key 保存依赖 `SETTINGS_ENCRYPTION_KEY`。

## 8. API 设计

### 8.1 自选股

`GET /api/watchlist`

返回自选股列表和最新行情快照。

`POST /api/watchlist`

添加股票。

```json
{
  "symbol": "AAPL",
  "market": "US"
}
```

`DELETE /api/watchlist/:id`

删除股票。

### 8.2 行情

`GET /api/quotes?symbols=AAPL.US,700.HK`

返回批量行情和数据状态。

### 8.3 邮件设置

`GET /api/settings/email`

读取邮件设置。

`PUT /api/settings/email`

保存邮件设置。

```json
{
  "enabled": true,
  "recipientEmail": "user@example.com",
  "sendTime": "08:30",
  "timezone": "Asia/Shanghai",
  "markets": ["US", "HK", "CN"],
  "watchlistOnly": false
}
```

### 8.4 摘要

`POST /api/digests/preview`

手动生成今日摘要预览，不发送邮件。

`POST /api/digests/send-test`

发送测试邮件，不计入每日正式发送幂等。

### 8.5 Chat

`POST /api/chat`

代理到 OpenAI-compatible 模型 API。

要求：

- 支持流式响应。
- 自动注入自选股、最新行情和最近新闻。
- 返回内容必须能展示数据来源和更新时间。

## 9. 定时任务设计

### 9.1 刷新行情

- 每 1 分钟刷新自选股行情。
- 失败后记录 `JobRun` 和 `QuoteSnapshot.errorCode`。
- 前端展示最后成功快照和失败状态。

### 9.2 收集新闻

- 邮件发送前抓取最近 24 小时新闻。
- 按自选股相关性、市场影响、时效性和来源可信度排序。
- 去重相同 URL 和相似标题。

### 9.3 生成摘要

邮件摘要结构：

- 今日市场重点。
- 自选股相关新闻。
- 潜在风险事件。
- 值得追问的问题。
- 来源链接。

摘要要求：

- 中文输出。
- 客观、简洁、可追溯。
- 不给出确定性买卖建议。
- 新闻不足时说明“今日相关新闻较少”。

### 9.4 发送邮件

- 按用户配置时间和时区发送。
- 使用 `date + recipientEmail` 做幂等。
- 成功或失败写入 `NewsDigest` 和 `JobRun`。
- 支持手动测试发送。

## 10. Chat 回答规范

Chat 定位为金融研究助手。

每次请求后端注入：

- 当前自选股列表。
- 最新行情快照。
- 最近 24-72 小时相关新闻。
- 最近几轮对话。

回答格式建议：

```text
结论：
依据：
数据时间：
来源：
不确定性：
```

必须遵守：

- 区分事实、推测和不确定信息。
- 涉及价格必须说明行情更新时间。
- 涉及新闻必须能指出来源或说明来源不足。
- 数据不足时说明缺少哪些信息。
- 不输出“必涨”“必跌”“应该买入”“应该卖出”等确定性投资建议。

上下文优先级：

1. 当前用户问题。
2. 当前自选股和最新行情。
3. 最近新闻。
4. 最近对话历史。
5. 通用金融知识。

## 11. 失败降级与错误处理

### 11.1 行情失败

场景：

- provider 权限不足。
- provider 速率限制。
- symbol 不存在。
- 网络错误。

处理：

- 页面保留最后成功快照。
- 明确显示失败状态和上次更新时间。
- 不让整个 Dashboard 崩溃。

### 11.2 新闻为空或失败

处理：

- 新闻为空显示友好空状态。
- 新闻 provider 失败时仍可展示行情。
- 邮件摘要可降级为行情摘要。

### 11.3 模型失败

处理：

- Chat 显示“模型暂时不可用，可以稍后重试”。
- 邮件摘要生成失败时不发送空邮件。
- 已收集新闻和行情保留，允许重试。

### 11.4 邮件失败

处理：

- 记录失败状态和可理解错误。
- 不暴露 SMTP 密码。
- 允许用户发送测试邮件排查配置。

## 12. 配置与安全

所有敏感信息通过环境变量配置。

### 12.1 Database

```bash
DATABASE_URL=
```

### 12.2 Quote Provider

```bash
QUOTE_PROVIDER=mock
LONGPORT_APP_KEY=
LONGPORT_APP_SECRET=
LONGPORT_ACCESS_TOKEN=
```

### 12.3 News Provider

```bash
NEWS_PROVIDER=mock
ALPHA_VANTAGE_API_KEY=
```

### 12.4 Model Provider

```bash
MODEL_PROVIDER=mock
MODEL_BASE_URL=
MODEL_API_KEY=
MODEL_NAME=
SETTINGS_ENCRYPTION_KEY=
```

### 12.5 Email

```bash
EMAIL_PROVIDER=mock
SMTP_URL=
EMAIL_FROM=
```

### 12.6 App

```bash
APP_PASSWORD=
APP_TIMEZONE=Asia/Shanghai
```

安全要求：

- `.env` 永不提交。
- 只提交 `.env.example` 占位符。
- 真实 API key、SMTP 密码、access token 不进入文件、日志、测试、fixture 或文档。
- 之前用户在聊天中发过真实样式的 key，绝不能写入仓库。
- 前端不直接接触任何 provider 完整密钥；页面只允许看到脱敏状态。
- 页面保存的 API Key 必须先用 `SETTINGS_ENCRYPTION_KEY` 做 AES-GCM 加密。

## 13. 开发里程碑

### Milestone 1：项目基础

交付：

- 初始化 Next.js 项目。
- 配置 TypeScript、Tailwind、shadcn/ui。
- 配置 PostgreSQL、Prisma、Docker Compose。
- 建立基础 Dashboard 布局。
- 建立 `.env.example`。
- 建立 mock providers。

验收：

- 本地能启动 Web App。
- 数据库能 migrate。
- Dashboard 能访问。
- 没有真实密钥进入仓库。

### Milestone 2：自选股管理

交付：

- Watchlist 数据模型。
- 添加、删除、列表 API。
- 股票代码标准化。
- 清爽可扫描的自选股表格。
- 空状态和错误状态。

验收：

- 可添加 `AAPL.US`、`700.HK`、`600519.SH`。
- 刷新页面后数据仍存在。
- 无自选股时有明确引导。

### Milestone 3：行情接入

交付：

- QuoteProvider 接口。
- MockQuoteProvider。
- LongbridgeQuoteProvider。
- QuoteSnapshot 保存。
- Dashboard 展示价格、涨跌幅、更新时间和数据状态。

验收：

- mock 模式下无需真实 key 也能开发。
- 真实 provider 配置后能返回准实时行情。
- provider 失败时页面不崩溃。

### Milestone 4：每日资讯邮件

交付：

- NewsProvider。
- 新闻去重和排序。
- 邮件设置页。
- 摘要生成。
- SMTP 邮件发送。
- 预览和测试发送。

验收：

- 可以配置邮箱和发送时间。
- 可以生成摘要预览。
- 可以收到测试邮件。
- 正式每日邮件不会重复发送。

### Milestone 5：Chat

交付：

- Chat UI。
- `/api/chat`。
- ModelProvider。
- 自选股、行情、新闻上下文注入。
- 历史消息保存。
- 回答结构化展示。

验收：

- 可以连续对话。
- 能回答“今天我的自选股有什么重要变化？”。
- 回答包含数据时间和来源。
- 模型失败时有友好提示。

### Milestone 6：质量与部署

交付：

- 单元测试。
- API 集成测试。
- 核心 E2E 测试。
- 部署说明。
- 日志和错误处理。

验收：

- 本地测试通过。
- mock 模式端到端可跑通。
- 真实 key 配置后可完成行情、摘要、邮件和 Chat 流程。

## 14. 测试计划

### 14.1 单元测试

覆盖：

- 股票代码标准化。
- 市场识别。
- provider 响应转换。
- 新闻去重。
- 新闻排序。
- 邮件发送时间计算。
- Chat 上下文构造。
- 错误归一化。

### 14.2 集成测试

使用 mock provider 验证：

- 添加股票后刷新行情。
- 新闻抓取后生成摘要。
- 邮件配置后发送测试邮件。
- Chat API 正确调用模型 provider。
- provider 失败时返回结构化错误。

### 14.3 E2E 测试

核心路径：

1. 打开 Dashboard。
2. 添加 `AAPL.US`、`700.HK`、`600519.SH`。
3. 查看清爽自选股表格。
4. 进入详情抽屉查看相关新闻。
5. 配置邮件。
6. 预览摘要。
7. 发送测试邮件。
8. 打开 Chat 并询问“今天我的自选股有什么重要变化？”。

### 14.4 UI 验收

必须满足：

- Dashboard 第一屏不拥挤。
- 表格信息层级清晰。
- 添加股票、追问 Chat、配置邮件都能在 1-2 步内完成。
- 空状态、失败状态和加载状态都有拟人且清晰的文案。
- 不出现复杂交易终端式的信息噪音。

## 15. 第一版总体验收标准

第一版完成后必须满足：

- 可以本地启动完整系统。
- 可以添加和删除美股、港股、A股。
- 可以看到准实时价格、涨跌幅和更新时间。
- 可以配置每日邮件发送时间和邮箱。
- 可以预览并收到财经摘要邮件。
- 可以通过 Chat 查询自选股、行情和相关新闻。
- Chat 回答包含数据时间和来源，不给出绝对投资建议。
- 外部 API 失败时系统有明确友好提示。
- mock provider 模式可完整跑通。
- 所有密钥均通过环境变量管理。

## 16. 后续扩展方向

- 持仓组合：买入价、数量、成本、盈亏和币种折算。
- 价格告警：价格突破、涨跌幅异常、新闻风险提醒。
- 多行情源 fallback：主 provider 失败时切换备用 provider。
- 更强新闻质量：接入付费新闻源或券商研究摘要。
- 报告导出：每日摘要导出为 PDF 或 Markdown。
- 多用户：账号、权限、共享 watchlist、团队邮件订阅。
- AI 工作流：自动生成每日追问、风险清单和观察列表，但不自动交易。
