<table>
  <tr>
    <td width="44">
      <img src="public/brand/marketpilot-icon.png" alt="MarketPilot" width="36" />
    </td>
    <td>
      <h1>MarketPilot — Personal AI Finance Workspace</h1>
    </td>
  </tr>
</table>



![MarketPilot dashboard](public/brand/marketpilot-dashboard.png)

**A calm AI workspace for your market watchlist.** MarketPilot turns prices, news, holdings, daily digests, and AI follow-up questions into one source-aware research flow.


## The Daily Market Loop

1. Track the watchlist you actually care about.
2. Read what changed across prices, market status, and related news.
3. Review a daily digest before it lands in your inbox.
4. Ask follow-up questions when a move deserves a closer look.

## Highlights

| Focus | How MarketPilot helps |
| --- | --- |
| Watchlist-first dashboard | Keep stocks, funds, holdings, and gold in a focused daily workspace. |
| Source-aware quotes | See price, change, market status, data freshness, and provider source together. |
| Daily digest workflow | Preview key market highlights and send them through real SMTP email delivery. |
| Research assistant | Ask AI follow-up questions grounded in your watchlist, quote snapshots, and recent news. |
| Personal holdings view | Record positions and follow floating P&L without turning the app into a trading terminal. |
| Provider control | Configure quote, news, model, and email providers from your own environment. |

## Why It Exists

Market research often starts in one place and ends in five others: quotes in an app, news in a feed, positions in a spreadsheet, summaries in email, and follow-up questions in a chat window.

MarketPilot brings that loop into a single personal workspace. It is designed to make daily market context easier to scan, easier to question, and easier to trace back to its source.

## What MarketPilot Is Not

- Not a trading brokerage.
- Not a high-frequency real-time market data system.
- Not deterministic financial advice.

## Run MarketPilot Locally

MarketPilot uses the `trade` conda environment in this workspace.

```bash
conda activate trade
npm install
cp .env.example .env
```

Prepare a local PostgreSQL database:

```bash
brew install postgresql@16
brew services start postgresql@16
psql -h 127.0.0.1 -d postgres -c "CREATE ROLE trade LOGIN PASSWORD 'trade' CREATEDB;"
createdb -h 127.0.0.1 -O trade trade
```

Generate Prisma client, run migrations, and start the app:

```bash
conda run -n trade npm run prisma:generate
DATABASE_URL="postgresql://trade:trade@127.0.0.1:5432/trade?schema=public" \
  conda run -n trade npm run prisma:migrate -- --name init
DATABASE_URL="postgresql://trade:trade@127.0.0.1:5432/trade?schema=public" \
  conda run --no-capture-output -n trade npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configure Providers

Copy `.env.example` to `.env`, then fill in the providers you want to use.

| Area | Environment variables | Notes |
| --- | --- | --- |
| Database | `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| Quotes | `QUOTE_PROVIDER`, `LONGPORT_APP_KEY`, `LONGPORT_APP_SECRET`, `LONGPORT_ACCESS_TOKEN` | `auto` can use public quote providers; Longbridge credentials are optional. |
| News | `NEWS_PROVIDER`, `ALPHA_VANTAGE_API_KEY` | Public news works by default; Alpha Vantage is optional. |
| Model | `MODEL_PROVIDER`, `MODEL_BASE_URL`, `MODEL_API_KEY`, `MODEL_NAME` | Uses an OpenAI-compatible chat/completions endpoint. |
| Email | `EMAIL_PROVIDER`, `SMTP_URL`, `EMAIL_FROM` | Required for real daily digest delivery. |
| App | `APP_TIMEZONE` | Defaults to `Asia/Shanghai`. |

For production startup details, see [get_start.md](get_start.md). For the fuller product and technical notes, see [docs/product-technical-spec.md](docs/product-technical-spec.md).

## Project Status

MarketPilot is an open-source personal finance workspace, actively evolving around watchlist research, real data providers, daily summaries, and AI-assisted review.

It is not intended for trading execution, brokerage connectivity, high-frequency real-time data, or deterministic financial advice.

## Star History

<a href="https://www.star-history.com/#JaydencoolCC/MarketPilot&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=JaydencoolCC/MarketPilot&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=JaydencoolCC/MarketPilot&type=Date" />
    <img alt="MarketPilot star history" src="https://api.star-history.com/svg?repos=JaydencoolCC/MarketPilot&type=Date" />
  </picture>
</a>

## License

MarketPilot is available under the [MIT License](LICENSE).
