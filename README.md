# Trade

个人 AI 金融信息工作台。产品和技术规格见 [docs/product-technical-spec.md](docs/product-technical-spec.md)。

## Development

```bash
conda activate trade
npm install
cp .env.example .env
npm run dev
```

默认运行模式使用真实数据和真实服务：行情使用 `QUOTE_PROVIDER=auto` 或显式真实 provider，新闻使用 `NEWS_PROVIDER=public`，模型使用 OpenAI-compatible API，邮件使用 SMTP。未配置模型或 SMTP 时，相关功能会明确提示缺少真实配置，不会在本地运行中自动退回 mock。

常用检查：

```bash
conda run -n trade npm test
conda run -n trade npm run test:e2e
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

真实 provider 检查：

- 行情：默认 `QUOTE_PROVIDER=auto` 会优先使用公开真实行情源；也可以显式设置为 `longbridge`、`sina` 或 `yahoo`。添加三类市场股票后确认行情刷新成功；失败时页面应保留上次数据并显示友好状态。
- 新闻：默认 `NEWS_PROVIDER=public` 会请求公开真实新闻源；也可以设置 `NEWS_PROVIDER=alpha-vantage` 和 `ALPHA_VANTAGE_API_KEY`，在详情抽屉和摘要预览里确认新闻来源、时间和去重结果。
- 模型：必须设置 `MODEL_PROVIDER=openai-compatible`，并在设置页保存 Base URL、模型名称和 API Key；测试连接成功后再验证 Chat 流式回答。未配置时会直接提示缺少真实模型配置。
- 邮件：设置 `EMAIL_PROVIDER=smtp`，并在设置页保存发件人和 SMTP 授权码，或在 `.env` 里配置 `SMTP_URL` 和 `EMAIL_FROM`；先发送测试邮件，再启用每日邮件和发送时间。QQ 邮箱需要先在邮箱设置中开启 SMTP 服务，并使用授权码而不是登录密码。
- 安全：不要提交 `.env`；设置页保存的 API Key 和 SMTP 授权码只保存在本机配置文件中，前端只显示脱敏状态。

## Deployment Checklist

上线前确认：

- PostgreSQL 可连接，且已执行 Prisma migration。
- `APP_TIMEZONE` 与每日邮件默认时区一致，默认 `Asia/Shanghai`。
- 至少执行过 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- 每日摘要内置按发送时间自动检查和发送；基金刷新可在外部 scheduler 中按需调用 `/api/jobs/refresh-funds`。股票页面实时价格由前端轮询 `/api/quotes`，不依赖后台 cron。
- 真实 key、SMTP 密码和 access token 只放在环境变量或本机设置中。

## Scheduled jobs

每日摘要任务会在服务启动后由内置调度器每分钟检查一次，按邮件设置里的 `sendTime` 和 `timezone` 到点发送；同一天同一收件人已经发送过时会跳过，避免重复发送。也可以手动调用任务入口：

```bash
curl -X POST http://localhost:3000/api/jobs/daily-digest
```

基金刷新任务入口：

```bash
curl -X POST http://localhost:3000/api/jobs/refresh-funds
```

开发期可以用系统 cron 定时调用基金刷新任务；每日摘要不需要额外 cron。
