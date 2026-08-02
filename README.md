# MarketPilot

<p>
  <img src="public/brand/marketpilot-icon.png" alt="MarketPilot" width="40" />
</p>

MarketPilot is a personal finance workspace for following the markets I actually care about. It keeps my watchlist, quote snapshots, holdings, funds, gold prices, daily email digest, and AI-assisted research questions in one place.

It is built for a simple daily routine: open the dashboard, see what changed, check the relevant news, and ask follow-up questions when something deserves a closer look.

![MarketPilot dashboard](public/brand/marketpilot-dashboard.png)

## Features

- Watchlist-first dashboard for stocks, holdings, funds, and gold.
- Quote snapshots with price, change, market status, freshness, and data source.
- Stock holding records with floating P&L based on the latest available quote.
- Daily market digest preview and SMTP email delivery.
- AI chat is grounded in the current watchlist, quote snapshots, and recent news.
- Configurable quote, news, model, and email providers.

## Application Positioning

MarketPilot is not a brokerage platform, trading terminal, or high-frequency market data system. It does not execute orders, connect to brokerage accounts, or provide decisive recommendations to buy or sell assets. The application is designed to support personal market review and research grounded in traceable sources. Its purpose is to make market information easier to examine and critically evaluate, rather than to automate or replace trading.


## Setup

Create the conda environment and install Node dependencies:

```bash
conda env create -f environment.yml
conda run -n trade npm ci
cp .env.example .env
```

Prepare a local PostgreSQL database. On Ubuntu/Debian, one straightforward option is:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE ROLE trade LOGIN PASSWORD 'trade' CREATEDB;"
sudo -u postgres createdb -O trade trade
```

Set `DATABASE_URL` in `.env`:

```bash
DATABASE_URL="postgresql://trade:trade@127.0.0.1:5432/trade?schema=public"
```

Generate the Prisma client, apply migrations, and start the dev server:

```bash
set -a
. ./.env
set +a

conda run -n trade npm run prisma:generate
conda run -n trade npx prisma migrate deploy
conda run --no-capture-output -n trade npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Start from `.env.example`, then fill in the providers you want to use.

| Area | Variables | Notes |
| --- | --- | --- |
| Database | `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| Quotes | `QUOTE_PROVIDER`, `LONGPORT_APP_KEY`, `LONGPORT_APP_SECRET`, `LONGPORT_ACCESS_TOKEN` | `auto` can use public quote providers; Longbridge credentials are optional. |
| News | `NEWS_PROVIDER`, `ALPHA_VANTAGE_API_KEY` | Public news works by default; Alpha Vantage is optional. |
| Model | `MODEL_PROVIDER`, `MODEL_BASE_URL`, `MODEL_API_KEY`, `MODEL_NAME` | Uses an OpenAI-compatible chat/completions endpoint. |
| Email | `EMAIL_PROVIDER`, `SMTP_URL`, `EMAIL_FROM` | Required for real daily digest delivery. |
| App | `APP_TIMEZONE` | Defaults to `Asia/Shanghai`. |

Runtime secrets and local state should stay out of Git:

- `.env`
- `.env.local`
- `.local/`

## Getting Started

For production startup, fill `.env` with real provider values and run:

```bash
chmod +x scripts/start-production.sh
./scripts/start-production.sh
```

The startup script installs dependencies, generates the Prisma client, applies migrations, builds the app, and starts the Next.js server.

## License

MarketPilot is available under the [MIT License](LICENSE).
