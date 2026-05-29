# 个人 AI 金融信息工作台产品/技术开发文档 v0.3

当前实现快照日期：2026-05-23。

本文件描述当前项目的真实实现状态、开发约束和后续演进方向。若 README、`get_start.md` 或代码实现与本文冲突，以当前代码和运行配置为准，并同步更新本文。

## 1. 产品定位

本项目是一个个人自用的 AI 金融信息工作台，用来集中管理关注股票、查看准实时行情、接收每日重点财经资讯邮件，并通过 Chat 追问和分析自选股相关信息。

第一版不是券商交易终端，也不是复杂投资组合记账工具。它的核心价值是把分散的价格、新闻、摘要、手动持仓浮动盈亏和问答整合成一个清爽、可靠、可追溯的个人金融助手。

核心闭环：

1. 添加美股、港股、A股自选股票。
2. 在 Dashboard 查看准实时价格、涨跌、更新时间、市场状态和相关新闻数。
3. 每天按配置时间收到重点财经资讯邮件。
4. 通过 Chat 基于自选股、行情和新闻继续追问。

第一版必须坚持：

- 个人自用优先。
- Watchlist-first，而不是交易-first。
- 准实时行情，不伪装交易级实时数据。
- 所有运行期功能默认使用真实数据和真实服务。
- AI 回答要有依据、时间和来源。
- 界面美观、拟人、易用、精简。
- 不做交易下单、确定性买卖建议、多用户 SaaS 或计费系统。

## 2. 当前实现概览

当前项目已实现：

- Next.js App Router Dashboard、Settings、Chat 页面。
- 自选股添加、删除、搜索、详情抽屉。
- 第二期首页资产切换：股票、持仓、基金、黄金。
- 股票持仓页，可从自选股录入成本价和股票数，并按当前行情显示浮动盈亏。
- PostgreSQL + Prisma 核心资产状态存储，本地文件保存设置和每日摘要发送状态。
- 真实行情 provider：`auto`、`sina`、`yahoo`、`longbridge`。
- 真实基金 provider：`public`，支持国内公募基金和 ETF。
- 真实黄金 provider：`public`，支持国际金价和人民币/克参考折算价。
- 真实新闻 provider：`public`、`alpha-vantage`。
- OpenAI-compatible 模型接入、连接测试、流式 Chat、每日摘要生成。
- SMTP 邮件发送、HTML/纯文本摘要、测试发送和正式发送。
- 服务内置每日摘要调度器和可选后台任务 API。
- 生产启动脚本 `scripts/start-production.sh` 和上线说明 `get_start.md`。

当前运行策略：

- 运行时默认使用真实 provider。
- `mock` provider 只允许测试环境显式使用。
- 未配置真实模型或 SMTP 时，功能会明确报错，不会在运行期自动退回 mock。
- 行情、新闻、模型、邮件失败时显示可理解错误，不能暴露密钥或原始连接串。

## 3. MVP 范围

### 3.1 包含功能

自选股管理：

- 添加、删除、查看自选股票。
- 支持市场：美股、港股、A股。
- 标准化股票代码，例如 `AAPL.US`、`700.HK`、`600519.SH`。
- 展示名称、代码、市场、价格、涨跌幅、市场状态、今日新闻数、数据状态和实际行情来源。
- 股票表顶部统一展示最近更新时间，不在每行重复显示抓取时间。

持仓：

- 首页左侧切换到持仓页。
- 只能从已有股票自选列表选择股票。
- 支持录入每股平均成本价和股票数。
- 股票数支持小数。
- 按股票自身行情币种计算持仓成本、当前市值、浮动盈亏和盈亏比例。
- 不做人民币折算、券商账户接入或复杂组合分析。

准实时行情：

- 股票页面打开时通过 `GET /api/quotes` 按秒轮询最新行情。
- 后端在添加自选股、刷新列表、Chat 和摘要生成时按需刷新并保存行情快照。
- 前端 Dashboard 展示最新快照和数据状态。
- 数据过期、行情失败或 provider 不可用时显示明确状态。
- 永远显示行情更新时间，不把过期数据伪装成实时数据。
- 市场状态优先查询真实接口；无法获得真实状态时显示 `unknown/未返回`，不使用本地规则猜测。

每日财经邮件：

- 用户可配置启用状态、收件邮箱、发送时间、时区和关注市场。
- 默认时区为 `Asia/Shanghai`。
- 邮件发送前收集最近 24 小时重点新闻。
- 使用真实模型生成中文摘要。
- 支持手动预览摘要、发送测试邮件和正式发送。
- 邮件正文支持 HTML 和纯文本降级，HTML 渲染会处理段落、列表和简单 Markdown 表格。

Chat 问答：

- 接入用户提供的 OpenAI-compatible API。
- 支持流式响应。
- 注入自选股、行情快照和最近新闻上下文。
- 回答必须包含数据时间和来源，不输出确定性买卖建议。

基金：

- 首页左侧切换到基金页。
- 支持添加国内公募基金和 ETF。
- 国内公募按净值、估值、涨跌幅和更新时间展示。
- ETF 复用真实行情 provider，按价格和涨跌幅展示。

黄金：

- 首页左侧切换到黄金页。
- 支持国际金价和人民币/克参考折算价切换。
- 支持 `1d`、`1m`、`3m`、`6m`、`1y` 区间图。
- 人民币/克为国际金价与 USD/CNY 汇率折算结果，页面必须明确标注参考口径。

### 3.2 不包含功能

第一版不做：

- 股票交易下单。
- 券商账户接入。
- 复杂组合分析。
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
- 左侧：资产导航，包含股票、持仓、基金、黄金。
- 侧栏或右侧区域：今日重点摘要和 Chat 快捷入口。
- 空状态：引导用户添加第一只股票。

自选股表格列：

- 名称
- 代码
- 市场
- 当前价格
- 涨跌幅
- 市场状态
- 今日新闻数
- 数据状态
- 来源
- 操作

详情抽屉：

- 最新行情摘要。
- 最近相关新闻。
- 数据来源、抓取时间和行情时间。
- 快捷追问按钮，例如“这只股票今天为什么波动？”

设置页：

- 作为服务连接与个人偏好中心，包含连接状态、AI Chat、每日邮件、行情与新闻、安全说明。
- AI Chat 可配置 OpenAI-compatible `Base URL`、模型名称和 API Key。
- API Key 由后端保存在本机配置文件中，前端只显示脱敏状态，不回显完整密钥。
- 每日邮件只保留必要字段：启用、收件邮箱、发送时间、时区、市场范围、只看自选股、预览、测试发送。
- 保存、测试、删除密钥后都要给出明确反馈。
- 邮件或模型失败时显示可理解原因，例如“SMTP 登录失败”或“模型连接测试失败”。

Chat 页面：

- 像研究助理，而不是普通闲聊窗口。
- 输入框提供与当前自选股相关的快捷问题。
- 回答先直接回应用户问题，再按需要补充行情、新闻、数据时间、来源和不确定性。
- 如果上下文不足，直接说明缺少哪些信息。

### 4.3 状态与文案

空状态示例：

- “还没有自选股。添加第一只股票后，我会开始整理价格、新闻和每日摘要。”

行情失败示例：

- “行情暂时不可用，当前显示的是上次成功更新的数据。”

市场状态未知示例：

- “未返回”

新闻为空示例：

- “过去 24 小时没有找到与自选股高度相关的重要新闻。”

模型失败示例：

- “摘要生成失败。行情和新闻已保存，可以稍后重试。”

禁止出现：

- 原始技术栈错误直接展示给用户。
- 无依据的投资建议。
- 没有更新时间的价格。
- 将未知市场状态硬编码成已休市。
- 冗长、营销化、难操作的首页。

## 5. 当前技术架构

### 5.1 技术栈

- 前端：Next.js App Router + TypeScript + React
- UI：Tailwind CSS + shadcn 风格基础组件 + lucide-react
- 后端：Next.js Route Handlers
- 数据库：PostgreSQL
- ORM：Prisma + `@prisma/adapter-pg`
- 定时任务：服务内置每日摘要调度器 + 外部 cron/scheduler 可选调用 `/api/jobs/*`
- 邮件：Nodemailer SMTP
- 模型接口：OpenAI-compatible API
- 基金数据：公开真实基金数据源 + ETF 行情复用 QuoteProvider
- 黄金数据：公开真实黄金历史价格 + USD/CNY 汇率折算
- 本地数据库：本机 PostgreSQL 或 Docker Compose PostgreSQL
- 开发环境：conda 环境 `trade`

### 5.2 目录结构

```text
app/
  api/
  chat/
  settings/
components/
  dashboard/
  chat/
  settings/
  ui/
lib/
  providers/
    quotes/
    funds/
    gold/
    news/
    email/
    model/
  jobs/
  db/
  domain/
  settings/
  utils/
prisma/
  schema.prisma
  migrations/
scripts/
  start-production.sh
tests/
  unit/
  integration/
docs/
  product-technical-spec.md
```

### 5.3 架构原则

- 外部服务全部通过 provider adapter 接入。
- 运行期使用真实 provider；mock provider 仅用于测试。
- 前端不直接访问行情、邮件、新闻或模型密钥。
- 后端统一处理鉴权、错误归一化和安全脱敏。
- 数据库只保存资产清单和每个标的一条最新快照。
- 邮件设置、模型/SMTP 配置和每日摘要发送状态走本地文件持久化。
- 后台任务 API 必须可重试、幂等，不依赖数据库任务审计表。
- 生产启动必须使用 `scripts/start-production.sh` 或等价的 build + `next start` 流程，不能使用 `npm run dev`。

## 6. Provider 策略

### 6.1 QuoteProvider

当前默认配置：

```bash
QUOTE_PROVIDER="auto"
```

支持 provider：

- `auto`：默认模式，自动尝试真实行情源。
- `sina`：新浪公开行情。
- `yahoo`：Yahoo Finance 图表/行情接口。
- `longbridge` / `longport`：长桥 OpenAPI，需配置凭证。
- `mock`：仅测试环境显式使用。

`auto` 当前行为：

- 搜索时合并新浪和 Yahoo 结果。
- 行情获取优先尝试 Yahoo，再尝试新浪。
- 成功返回时 provider 显示实际来源，例如 `yahoo` 或 `sina`，不添加 `auto:` 前缀。
- 行情价格获取后，会尝试通过东方财富真实字段补充市场状态。
- 如果市场状态接口未返回可识别状态，保留 provider 返回状态或显示 `unknown/未返回`。

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
- provider 失败时页面保留上次成功快照，并显示失败状态。

### 6.2 FundProvider

当前默认配置：

```bash
FUND_PROVIDER="public"
```

支持范围：

- 国内公募基金：以 `.FUND` 标准化，例如 `110022.FUND`。
- ETF：复用证券 symbol，例如 `510300.SH`、`SPY.US`、`2800.HK`。

要求：

- 搜索和直接添加都可用。
- 国内公募展示净值、估值、日涨跌幅和更新时间。
- ETF 展示价格、涨跌幅和更新时间。
- provider 失败时页面显示失败状态，不编造基金数据。

### 6.3 GoldProvider

当前默认配置：

```bash
GOLD_PROVIDER="public"
```

支持范围：

- `international`：国际金价，美元/盎司。
- `domestic`：人民币/克参考折算价。
- range：`1d`、`1m`、`3m`、`6m`、`1y`。

当前实现：

- 国际金价历史点来自 `vang.today` 公开 XAU/USD 历史接口。
- 人民币/克参考价使用国际金价和公开 USD/CNY 汇率接口折算。
- 返回 provider 为 `vang.today` 或 `vang.today+open-er-api`。

要求：

- 图表使用真实历史价格点。
- 国内口径必须标注为参考折算价，不冒充上海金所历史价。
- provider 失败时显示友好错误。

### 6.4 NewsProvider

当前默认配置：

```bash
NEWS_PROVIDER="public"
```

支持 provider：

- `public`：组合东方财富和 Yahoo Finance RSS 等公开新闻源。
- `alpha-vantage`：需要 `ALPHA_VANTAGE_API_KEY`。
- `mock`：仅测试环境显式使用。

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
- 新闻 provider 失败时不能影响行情展示；Dashboard 新闻数默认安全显示为 `0`。

### 6.5 EmailProvider

当前默认配置：

```bash
EMAIL_PROVIDER="smtp"
```

支持 provider：

- `smtp`：Nodemailer SMTP。
- `mock`：仅测试环境显式使用。

接口：

```ts
interface EmailProvider {
  sendDigest(input: DigestEmail): Promise<EmailSendResult>;
}
```

要求：

- 支持发送测试邮件。
- 支持 HTML 和纯文本降级。
- HTML 邮件应清晰展示标题、段落、列表、表格和来源。
- 失败时不暴露 SMTP 密码或完整连接串。
- 未配置 `SMTP_URL` 或 `EMAIL_FROM` 时明确提示真实邮件未配置。

### 6.6 ModelProvider

当前默认配置：

```bash
MODEL_PROVIDER="openai-compatible"
```

支持 provider：

- `openai-compatible`：兼容 OpenAI Chat Completions API。
- `mock`：仅测试环境显式使用。

接口：

```ts
interface ModelProvider {
  streamChat(input: ChatRequest): AsyncIterable<ChatChunk>;
  generateDigest(input: DigestPrompt): Promise<DigestPreview>;
}
```

配置优先级：

1. 设置页保存的模型配置。
2. `.env` 中的 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME`。
3. 如果仍不完整，返回未配置错误，不自动使用 mock。

要求：

- 后端代理模型请求，前端不接触完整 `MODEL_API_KEY`。
- 支持流式 Chat。
- 摘要生成要求模型优先返回结构化 JSON，正文避免 Markdown 表格。
- 模型失败时不发送空摘要邮件，允许用户稍后重试。

## 7. 数据模型

当前 Prisma schema 使用 PostgreSQL，但数据库职责已经收缩为“当前资产状态库”。

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

保存每只股票的最新一条行情快照。

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

要求：

- `symbol` 唯一，每个标的只保留一条最新记录。
- 刷新时按 `symbol` upsert，而不是追加历史。
- 保存成功行情和错误状态。
- `marketStatus` 当前以字符串保存，业务类型包含 `open`、`closed`、`pre_market`、`after_hours`、`unknown`。

### 7.3 FundWatchlistItem / FundSnapshot

保存自选基金和每只基金的最新一条快照。

关键字段：

- `code`
- `normalizedSymbol`
- `type`
- `market`
- `name`
- `currency`
- `netValue`
- `estimateValue`
- `changePercent`
- `provider`
- `quoteTime`
- `errorCode`
- `errorMessage`

约束：

- `normalizedSymbol` 唯一。
- `type` 为 `mutual_fund` 或 `etf`。
- `FundSnapshot.symbol` 唯一，每个标的只保留一条最新记录。
- 刷新时按 `symbol` upsert，而不是追加历史。

### 7.4 本地文件持久化

以下数据不再进入数据库，而是保存在 `.local` 下的本地文件：

- 邮件设置：启用状态、收件邮箱、发送时间、时区、市场范围、只看自选股。
- 模型/SMTP 配置：设置页保存的 Base URL、模型名、密钥脱敏状态、测试状态。
- 每日摘要发送状态：`date`、`recipientEmail`、`status`、`sentAt`，以及用于当天幂等和重试的摘要内容或摘要元信息。

约束：

- 本地文件是这些配置和摘要状态的唯一真源，不再与数据库双写。
- 前端 API 永不返回原始 secret。
- 设置页保存的密钥只写入本机配置文件，前端 API 永不返回原始 secret。
- 每日摘要正式发送按 `date + recipientEmail` 在本地文件中保证幂等。

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

### 8.2 股票搜索

`GET /api/securities/search?q=AAPL`

按代码或公司名搜索股票，并返回标准化 symbol。

### 8.3 行情

`GET /api/quotes?symbols=AAPL.US,700.HK`

返回批量实时拉取行情和数据状态。

### 8.4 基金

`GET /api/funds`

返回自选基金和最新快照。

`POST /api/funds`

添加基金或 ETF。

`DELETE /api/funds/:id`

删除自选基金。

`GET /api/funds/search?q=110022`

搜索基金或 ETF。

`GET /api/funds/quotes?symbols=110022.FUND,SPY.US`

返回基金最新快照。

### 8.5 黄金

`GET /api/gold/history?scope=international&range=3m`

返回黄金历史价格序列、当前价和区间涨跌。

### 8.6 新闻

`GET /api/news?symbols=AAPL.US`

返回最近相关新闻。

### 8.7 设置

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

`GET /api/settings/integrations`

读取 provider 连接状态。

`GET /api/settings/model`

读取脱敏后的模型配置。

`PUT /api/settings/model`

保存模型 Base URL、模型名称和 API Key。

`DELETE /api/settings/model/key`

删除已保存模型密钥。

`POST /api/settings/model/test`

测试模型连接。

`POST /api/settings/providers/test`

测试 provider 连接，包括模型和邮件。

### 8.8 摘要

`POST /api/digests/preview`

手动生成今日摘要预览，不发送邮件。

`POST /api/digests/send-test`

发送测试邮件，不计入每日正式发送幂等。

`POST /api/digests/send`

手动发送正式每日摘要，遵守正式发送幂等。

### 8.9 Chat

`POST /api/chat`

代理到 OpenAI-compatible 模型 API。

要求：

- 支持流式响应。
- 自动注入自选股、最新行情和最近新闻。
- 返回内容必须能展示数据来源和更新时间。

### 8.10 后台任务

`POST /api/jobs/refresh-funds`

刷新自选基金。

`POST /api/jobs/daily-digest`

执行每日摘要任务。

后台任务面向个人部署直接调用，不要求配置 `APP_PASSWORD`。

## 9. 定时任务设计

当前项目内置每日摘要调度器。服务启动后每分钟检查一次邮件设置，按 `sendTime` 和 `timezone` 到点发送每日摘要；同一天同一收件人已发送时跳过，避免重复发送。基金刷新可继续由系统 cron、云平台 scheduler、PM2、supervisor 或其他进程管理工具按需调用后台任务 API。

### 9.1 股票行情刷新

- 当前不提供股票行情后台 cron endpoint。
- 股票 Dashboard 打开时由前端按秒轮询 `GET /api/quotes` 获取最新价格。
- 添加自选股、刷新列表、Chat 和摘要生成会按需调用内部 `refreshQuotes()` 保存行情快照。
- 失败时前端展示最后可用数据和失败状态，不把过期数据伪装成实时数据。

### 9.2 收集新闻

- Dashboard 新闻数、Chat 和摘要任务会按需调用 NewsProvider。
- 邮件发送前抓取最近 24 小时新闻。
- 按自选股相关性、市场影响、时效性和来源可信度排序。
- 去重相同 URL 和相似标题。
- 新闻仅在当前请求链路中使用，不写数据库归档。

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
- 新闻不足时说明“今日相关新闻较少”或返回明确空状态。

### 9.4 发送邮件

- 服务内置调度器每分钟检查一次每日邮件设置。
- 到达用户配置的发送时间和时区后自动调用每日摘要发送流程。
- `POST /api/jobs/daily-digest` 保留为手动或外部触发入口，接口内部同样按用户配置时间和时区判断是否到点。
- 使用本地摘要状态文件中的 `date + recipientEmail` 做幂等。
- 成功或失败通过接口响应和服务日志体现，不写数据库任务审计表。
- 支持手动测试发送。

## 10. Chat 回答规范

Chat 定位为金融研究助手。

每次请求后端注入：

- 当前自选股列表。
- 最新行情快照。
- 最近 24-72 小时相关新闻。
- 当前请求的用户问题和运行时上下文时间信息。

回答要求：

- 先直接回答用户真正问的问题，语气自然、具体、克制。
- 按需要补充行情变化、相关新闻、数据时间和不确定性。
- 只有在数据对比明显有帮助时才使用表格。
- 不判断该不该买、卖、补仓或持有。
- 可以提示用户关注哪些条件、风险和后续验证点。
- 信息不足时直接说明缺什么。

上下文优先级：

1. 当前用户问题。
2. 当前自选股和最新行情。
3. 最近新闻。
4. 通用金融知识。

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
- 不能把未知市场状态猜成已休市。

### 11.2 新闻为空或失败

处理：

- 新闻为空显示友好空状态。
- 新闻 provider 失败时仍可展示行情。
- Watchlist 行新闻数安全显示为 `0`。
- 每日摘要不会因为新闻为空而编造新闻。

### 11.3 模型失败

处理：

- Chat 显示“模型暂时不可用，可以稍后重试”。
- 邮件摘要生成失败时不发送空邮件。
- 已收集新闻和行情保留，允许重试。
- 未配置真实模型时明确提示配置 Base URL、模型名称和 API Key。

### 11.4 邮件失败

处理：

- 记录失败状态和可理解错误。
- 不暴露 SMTP 密码。
- 允许用户发送测试邮件排查配置。
- 未配置真实 SMTP 时明确提示填写 SMTP 授权码并保存邮件连接。

## 12. 配置与安全

所有敏感信息通过环境变量或设置页本机配置。

### 12.1 Database

```bash
DATABASE_URL="postgresql://trade:trade@localhost:5432/trade?schema=public"
```

### 12.2 Quote Provider

```bash
QUOTE_PROVIDER="auto" # auto | sina | yahoo | longbridge
LONGPORT_APP_KEY=""
LONGPORT_APP_SECRET=""
LONGPORT_ACCESS_TOKEN=""
```

### 12.3 News Provider

```bash
NEWS_PROVIDER="public" # public | alpha-vantage
ALPHA_VANTAGE_API_KEY=""
```

### 12.4 Fund / Gold Provider

```bash
FUND_PROVIDER="public" # public
GOLD_PROVIDER="public" # public
```

### 12.5 Model Provider

```bash
MODEL_PROVIDER="openai-compatible"
MODEL_BASE_URL=""
MODEL_API_KEY=""
MODEL_NAME=""
```

### 12.6 Email

```bash
EMAIL_PROVIDER="smtp" # smtp
SMTP_URL=""
EMAIL_FROM="Trade Desk <digest@example.com>"
```

### 12.7 App

```bash
APP_TIMEZONE="Asia/Shanghai"
```

安全要求：

- `.env` 永不提交。
- 只提交 `.env.example` 占位符。
- 真实 API key、SMTP 密码和 access token 不进入文件、日志、测试、fixture 或文档。
- 前端不直接接触任何 provider 完整密钥；页面只允许看到脱敏状态。
- 页面保存的 API Key 和 SMTP 授权码写入本机设置文件，文件不得提交。
- 生产启动脚本会拒绝 `mock` provider。

## 13. 启动与部署

### 13.1 本地开发

开发环境使用 conda 环境 `trade`：

```bash
conda activate trade
npm install
cp .env.example .env
npm run dev
```

非交互命令优先使用：

```bash
conda run -n trade <command>
```

### 13.2 生产启动

生产启动说明见 `get_start.md`。

推荐正式启动脚本：

```bash
./scripts/start-production.sh
```

脚本会执行：

1. 读取 `.env`。
2. 校验生产必需环境变量。
3. 拒绝 `mock` provider。
4. 使用 `npm ci` 安装锁定依赖。
5. 生成 Prisma client。
6. 执行 `prisma migrate deploy` 应用生产数据库迁移。
7. 执行 `npm run build` 生成生产构建。
8. 执行 `npm run start` 启动 Next.js 生产服务。

生产环境不要使用：

```bash
npm run dev
```

### 13.3 定时任务部署

上线后每日摘要不需要额外配置 cron；服务进程启动后会自动按发送时间检查并发送。基金刷新可按需要额外配置定时任务：

```bash
curl -X POST http://127.0.0.1:3000/api/jobs/refresh-funds
```

```bash
curl -X POST http://127.0.0.1:3000/api/jobs/daily-digest
```

每日摘要接口保留为手动触发入口，不是按时发送的必需配置。

## 14. 当前里程碑状态

### Milestone 1：项目基础

状态：已实现。

交付：

- Next.js 项目。
- TypeScript、Tailwind、基础 UI 组件。
- PostgreSQL、Prisma、Docker Compose。
- Dashboard、Settings、Chat 基础页面。
- `.env.example`。
- 测试环境 mock providers。

### Milestone 2：自选股管理

状态：已实现。

交付：

- Watchlist 数据模型。
- 添加、删除、列表 API。
- 股票代码标准化。
- 可扫描的自选股表格。
- 空状态和错误状态。

验收：

- 可添加美股、港股、A股。
- 刷新页面后数据仍存在。
- 无自选股时有明确引导。

### Milestone 3：真实行情接入

状态：已实现并持续优化。

交付：

- QuoteProvider 接口。
- `auto`、`sina`、`yahoo`、`longbridge` provider。
- QuoteSnapshot 保存。
- Dashboard 展示价格、涨跌幅、更新时间、市场状态、数据状态和真实来源。

验收：

- 默认 `QUOTE_PROVIDER=auto` 可尝试真实公开行情源。
- provider 成功后页面显示实际来源。
- 市场状态来自真实接口或显示 `未返回`。
- provider 失败时页面不崩溃。

### Milestone 4：每日资讯邮件

状态：已实现。

交付：

- NewsProvider。
- 新闻去重和排序。
- 邮件设置页。
- 摘要生成。
- SMTP 邮件发送。
- HTML/纯文本邮件渲染。
- 预览和测试发送。

验收：

- 可以配置邮箱和发送时间。
- 可以生成摘要预览。
- 可以收到测试邮件。
- 正式每日邮件不会重复发送。
- 邮件正文不应出现难读的原始 Markdown 堆叠。

### Milestone 5：Chat

状态：已实现。

交付：

- Chat UI。
- `/api/chat`。
- ModelProvider。
- 自选股、行情、新闻上下文注入。
- 历史消息保存。
- 流式响应。

验收：

- 可以连续对话。
- 能回答“今天我的自选股有什么重要变化？”。
- 回答包含数据时间和来源。
- 模型失败时有友好提示。

### Milestone 6：质量与部署

状态：已实现基础能力，后续继续增强。

交付：

- 单元测试。
- API 集成测试。
- provider 行为测试。
- 部署说明。
- 生产启动脚本。
- 日志和错误处理基础。

验收：

- 本地测试、类型检查、lint、build 可运行。
- 真实 provider 配置后可完成行情、摘要、邮件和 Chat 流程。
- 生产启动脚本不使用开发服务器。

## 15. 测试计划

### 15.1 单元测试

覆盖：

- 股票代码标准化。
- 市场识别。
- provider 响应转换。
- 新闻去重。
- 新闻排序。
- 邮件发送时间计算。
- 邮件 HTML 渲染。
- Chat 上下文构造。
- 错误归一化。

### 15.2 集成测试

测试环境可显式使用 mock provider 验证：

- 添加股票后刷新行情。
- 新闻抓取后生成摘要。
- 邮件配置后发送测试邮件。
- Chat API 正确调用模型 provider。
- provider 失败时返回结构化错误。

### 15.3 真实 provider 验收

真实环境验收：

1. 配置 `QUOTE_PROVIDER=auto`。
2. 添加美股、港股、A股。
3. 确认行情价格、涨跌幅、来源和更新时间正常展示。
4. 确认市场状态来自真实返回；无法获取时显示 `未返回`。
5. 配置 `NEWS_PROVIDER=public` 并查看详情抽屉相关新闻。
6. 配置真实 OpenAI-compatible 模型并测试 Chat。
7. 配置 SMTP 并发送测试邮件。
8. 手动预览每日摘要并确认邮件可读。

### 15.4 UI 验收

必须满足：

- Dashboard 第一屏不拥挤。
- 表格信息层级清晰。
- 添加股票、追问 Chat、配置邮件都能在 1-2 步内完成。
- 空状态、失败状态和加载状态都有拟人且清晰的文案。
- 不出现复杂交易终端式的信息噪音。

## 16. 第一版总体验收标准

第一版必须满足：

- 可以本地启动完整系统。
- 可以使用生产脚本正式启动服务。
- 可以添加和删除美股、港股、A股。
- 可以看到准实时价格、涨跌幅、更新时间、数据状态和真实行情来源。
- 市场状态不靠本地规则猜测。
- 可以配置每日邮件发送时间和邮箱。
- 可以预览并收到财经摘要邮件。
- 可以通过 Chat 查询自选股、行情和相关新闻。
- Chat 回答包含数据时间和来源，不给出绝对投资建议。
- 外部 API 失败时系统有明确友好提示。
- 运行期不会自动退回 mock。
- 所有密钥均通过环境变量或本机设置管理。

## 17. 后续扩展方向

- 持仓组合：买入价、数量、成本、盈亏和币种折算。
- 价格告警：价格突破、涨跌幅异常、新闻风险提醒。
- 更强行情源 fallback：引入更稳定的付费行情源。
- 更强新闻质量：接入付费新闻源或券商研究摘要。
- 报告导出：每日摘要导出为 PDF 或 Markdown。
- 多用户：账号、权限、共享 watchlist、团队邮件订阅。
- AI 工作流：自动生成每日追问、风险清单和观察列表，但不自动交易。
