WITH latest_quote_snapshots AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "symbol"
      ORDER BY "quoteTime" DESC, "createdAt" DESC, "id" DESC
    ) AS row_num
  FROM "QuoteSnapshot"
),
latest_fund_snapshots AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "symbol"
      ORDER BY "quoteTime" DESC, "createdAt" DESC, "id" DESC
    ) AS row_num
  FROM "FundSnapshot"
)
DELETE FROM "QuoteSnapshot"
WHERE "id" IN (
  SELECT "id" FROM latest_quote_snapshots WHERE row_num > 1
);

WITH latest_fund_snapshots AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "symbol"
      ORDER BY "quoteTime" DESC, "createdAt" DESC, "id" DESC
    ) AS row_num
  FROM "FundSnapshot"
)
DELETE FROM "FundSnapshot"
WHERE "id" IN (
  SELECT "id" FROM latest_fund_snapshots WHERE row_num > 1
);

DROP INDEX IF EXISTS "QuoteSnapshot_symbol_quoteTime_idx";
DROP INDEX IF EXISTS "FundSnapshot_symbol_quoteTime_idx";

CREATE UNIQUE INDEX "QuoteSnapshot_symbol_key" ON "QuoteSnapshot"("symbol");
CREATE UNIQUE INDEX "FundSnapshot_symbol_key" ON "FundSnapshot"("symbol");

DROP TABLE IF EXISTS "NewsArticle";
DROP TABLE IF EXISTS "NewsDigest";
DROP TABLE IF EXISTS "ChatMessage";
DROP TABLE IF EXISTS "ChatSession";
DROP TABLE IF EXISTS "JobRun";
DROP TABLE IF EXISTS "EmailDigestSetting";
DROP TABLE IF EXISTS "IntegrationSetting";

DROP TYPE IF EXISTS "EmailStatus";
DROP TYPE IF EXISTS "JobStatus";
