# 正式上线启动指南

这份文档用于正式启动 `trade` 项目，不是测试脚本，也不是开发启动流程。

## 1. 前置条件

- 已安装 conda，并已创建 `trade` 环境。
- 服务器可以访问生产 PostgreSQL。
- 服务器可以访问真实行情、新闻、模型和 SMTP 服务。
- 项目根目录存在 `.env`，且不要提交到 Git。

## 2. 准备生产环境变量

从示例文件创建生产配置：

```bash
cp .env.example .env
```

生产环境必须至少配置：

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/trade?schema=public"
QUOTE_PROVIDER="auto"
NEWS_PROVIDER="public"
MODEL_PROVIDER="openai-compatible"
EMAIL_PROVIDER="smtp"
APP_TIMEZONE="Asia/Shanghai"
```

模型和邮件可以在设置页保存，也可以直接写入 `.env`：

```bash
MODEL_BASE_URL="https://your-openai-compatible-endpoint"
MODEL_API_KEY="替换为真实 API Key"
MODEL_NAME="替换为真实模型名"
SMTP_URL="smtp://user:password@smtp.example.com:587"
EMAIL_FROM="Trade Desk <digest@example.com>"
```

生产环境不要使用 `mock` provider。

## 3. 一键正式启动

执行：

```bash
chmod +x scripts/start-production.sh
./scripts/start-production.sh
```

脚本会按正式上线顺序执行：

1. 读取 `.env`。
2. 校验生产必需环境变量。
3. 拒绝 `mock` provider。
4. 使用 `npm ci` 安装锁定依赖。
5. 生成 Prisma client。
6. 执行 `prisma migrate deploy` 应用生产数据库迁移。
7. 执行 `npm run build` 生成生产构建。
8. 执行 `npm run start` 启动 Next.js 生产服务。

默认监听：

```text
0.0.0.0:3000
```

如需修改端口：

```bash
PORT=8080 ./scripts/start-production.sh
```

如需使用其他 conda 环境名：

```bash
CONDA_ENV=trade ./scripts/start-production.sh
```

## 4. 后台定时任务

每日摘要邮件由服务内置调度器按设置页的发送时间自动检查和发送，不需要额外配置 cron。基金刷新仍可由系统 cron、云平台 scheduler 或进程管理器按需调用。

基金刷新可按需要定时调用：

```bash
curl -X POST http://127.0.0.1:3000/api/jobs/refresh-funds
```

每日摘要接口仍可手动调用；接口会根据邮件设置里的发送时间、时区和当天发送记录自行判断是否真正发送，避免重复发送。

```bash
curl -X POST http://127.0.0.1:3000/api/jobs/daily-digest
```

## 5. 进程托管建议

正式环境建议用 systemd、PM2、supervisor 或云平台进程管理来托管：

```bash
./scripts/start-production.sh
```

不要使用 `npm run dev` 作为线上启动命令。
