-- CreateTable
CREATE TABLE "FundWatchlistItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "normalizedSymbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "market" "Market",
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundWatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundSnapshot" (
    "id" TEXT NOT NULL,
    "fundItemId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "netValue" DECIMAL(18,6) NOT NULL,
    "estimateValue" DECIMAL(18,6),
    "changePercent" DECIMAL(12,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "quoteTime" TIMESTAMP(3) NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundWatchlistItem_normalizedSymbol_key" ON "FundWatchlistItem"("normalizedSymbol");

-- CreateIndex
CREATE INDEX "FundSnapshot_symbol_quoteTime_idx" ON "FundSnapshot"("symbol", "quoteTime");

-- AddForeignKey
ALTER TABLE "FundSnapshot" ADD CONSTRAINT "FundSnapshot_fundItemId_fkey" FOREIGN KEY ("fundItemId") REFERENCES "FundWatchlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
