# Trade

个人 AI 金融信息工作台。产品和技术规格见 [docs/product-technical-spec.md](docs/product-technical-spec.md)。

## Development

```bash
conda activate trade
npm install
cp .env.example .env
npm run dev
```

默认使用 mock providers，不需要真实 API key 即可开发 Dashboard、自选股、摘要预览和 Chat。

常用检查：

```bash
conda run -n trade npm test
conda run -n trade npm run typecheck
conda run -n trade npm run lint
conda run -n trade npm run build
```

## Local PostgreSQL

本项目支持本机 PostgreSQL 或 Docker PostgreSQL。二选一即可。

本机 PostgreSQL：

```bash
brew install postgresql@16
brew services start postgresql@16
```

首次初始化项目数据库：

```bash
psql -h 127.0.0.1 -d postgres -c "CREATE ROLE trade LOGIN PASSWORD 'trade' CREATEDB;"
createdb -h 127.0.0.1 -O trade trade
conda run -n trade npm run prisma:generate
DATABASE_URL="postgresql://trade:trade@127.0.0.1:5432/trade?schema=public" \
  conda run -n trade npm run prisma:migrate -- --name init
```

Docker PostgreSQL：

```bash
docker compose up -d postgres
conda run -n trade npm run prisma:generate
DATABASE_URL="postgresql://trade:trade@127.0.0.1:5432/trade?schema=public" \
  conda run -n trade npm run prisma:migrate
```

真实数据库模式启动：

```bash
DATABASE_URL="postgresql://trade:trade@127.0.0.1:5432/trade?schema=public" \
  conda run --no-capture-output -n trade npm run dev
```

## Provider Verification

Mock 模式端到端检查：

1. 启动应用后打开 Dashboard。
2. 添加 `AAPL.US`、`700.HK`、`600519.SH`。
3. 确认表格显示价格、涨跌幅、更新时间、市场状态、新闻数和数据状态。
4. 打开设置页，配置每日邮件并发送测试邮件。
5. 打开 Chat，询问“今天我的自选股有什么重要变化？”。
6. 确认回答包含结论、依据、数据时间、来源和不确定性。

真实 provider 检查：

- 行情：设置 `QUOTE_PROVIDER` 为 `longbridge`、`sina` 或 `yahoo`，添加三类市场股票后确认行情刷新成功；失败时页面应保留上次数据并显示友好状态。
- 新闻：设置 `NEWS_PROVIDER=alpha-vantage` 和 `ALPHA_VANTAGE_API_KEY`，在详情抽屉和摘要预览里确认新闻来源、时间和去重结果。
- 模型：设置 `MODEL_PROVIDER=openai-compatible`、`MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME`，在设置页测试连接，再验证 Chat 流式回答。
- 邮件：设置 `EMAIL_PROVIDER=smtp`、`SMTP_URL`、`EMAIL_FROM`，先发送测试邮件，再手动触发每日摘要任务。
- 安全：不要提交 `.env`；页面保存的模型 API Key 需要配置 `SETTINGS_ENCRYPTION_KEY`。

## Deployment Checklist

上线前确认：

- PostgreSQL 可连接，且已执行 Prisma migration。
- `APP_PASSWORD` 已设置，用于保护 `/api/jobs/*`。
- `APP_TIMEZONE` 与每日邮件默认时区一致，默认 `Asia/Shanghai`。
- 至少执行过 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- 定时任务已配置：行情刷新建议每分钟调用 `/api/jobs/refresh-quotes`；每日摘要任务可每 5-15 分钟调用 `/api/jobs/daily-digest`，接口内部会按发送时间和重复发送状态判断是否执行。
- 真实 key、SMTP 密码和 access token 只放在环境变量或加密设置中。

## Scheduled jobs

每日摘要任务入口：

```bash
curl -X POST http://localhost:3000/api/jobs/daily-digest \
  -H "Authorization: Bearer $APP_PASSWORD"
```

该接口会按邮件设置里的 `sendTime` 和 `timezone` 判断是否到点；同一天同一收件人已经发送过时会跳过，避免重复发送。

行情刷新任务入口：

```bash
curl -X POST http://localhost:3000/api/jobs/refresh-quotes \
  -H "Authorization: Bearer $APP_PASSWORD"
```

开发期可以用系统 cron 每分钟调用行情刷新任务，再用更低频率调用每日摘要任务。
