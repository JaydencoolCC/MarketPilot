# Trade

个人 AI 金融信息工作台。产品和技术规格见 [docs/product-technical-spec.md](docs/product-technical-spec.md)。

## Development

```bash
conda activate trade
npm install
cp .env.example .env
npm run dev
```

默认行情使用 `QUOTE_PROVIDER=auto`，优先请求公开真实行情源；新闻、模型和邮件默认使用 mock providers，不需要真实 API key 即可开发 Dashboard、自选股、摘要预览和 Chat。

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
- 邮件：设置 `EMAIL_PROVIDER=smtp`，并在设置页保存发件人和 SMTP 授权码；先发送测试邮件，再手动触发每日摘要任务。QQ 邮箱需要先在邮箱设置中开启 SMTP 服务，并使用授权码而不是登录密码。
- 安全：不要提交 `.env`；本地开发会自动创建 `.local/settings-encryption-key` 用来加密页面保存的密钥，生产部署建议显式配置 `SETTINGS_ENCRYPTION_KEY`。

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
