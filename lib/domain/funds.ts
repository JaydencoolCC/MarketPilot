import { AppError } from "@/lib/domain/errors";
import type { FundSearchResult, FundType, Market } from "@/lib/domain/types";
import { marketFromSymbol, normalizeSymbol, securityFromSymbol } from "@/lib/domain/symbols";

const KNOWN_FUNDS: FundSearchResult[] = [
  {
    code: "161128",
    normalizedSymbol: "161128.FUND",
    type: "mutual_fund",
    name: "易方达标普信息科技指数(QDII-LOF)A(人民币)",
    currency: "CNY",
  },
  {
    code: "012868",
    normalizedSymbol: "012868.FUND",
    type: "mutual_fund",
    name: "易方达标普信息科技指数(QDII-LOF)C(人民币)",
    currency: "CNY",
  },
  {
    code: "003721",
    normalizedSymbol: "003721.FUND",
    type: "mutual_fund",
    name: "易方达标普信息科技指数(QDII-LOF)A(美元现汇)",
    currency: "USD",
  },
  {
    code: "012869",
    normalizedSymbol: "012869.FUND",
    type: "mutual_fund",
    name: "易方达标普信息科技指数(QDII-LOF)C(美元现汇)",
    currency: "USD",
  },
  {
    code: "110022",
    normalizedSymbol: "110022.FUND",
    type: "mutual_fund",
    name: "易方达消费行业股票",
    currency: "CNY",
  },
  {
    code: "000001",
    normalizedSymbol: "000001.FUND",
    type: "mutual_fund",
    name: "华夏成长混合",
    currency: "CNY",
  },
  {
    code: "510300",
    normalizedSymbol: "510300.SH",
    type: "etf",
    market: "CN",
    name: "沪深300ETF",
    currency: "CNY",
  },
  {
    code: "159919",
    normalizedSymbol: "159919.SZ",
    type: "etf",
    market: "CN",
    name: "沪深300ETF",
    currency: "CNY",
  },
  {
    code: "SPY",
    normalizedSymbol: "SPY.US",
    type: "etf",
    market: "US",
    name: "SPDR S&P 500 ETF",
    currency: "USD",
  },
  {
    code: "GLD",
    normalizedSymbol: "GLD.US",
    type: "etf",
    market: "US",
    name: "SPDR Gold Shares",
    currency: "USD",
  },
  {
    code: "2800",
    normalizedSymbol: "2800.HK",
    type: "etf",
    market: "HK",
    name: "盈富基金",
    currency: "HKD",
  },
];

export function normalizeFundSymbol(input: string, type?: FundType, market?: Market) {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) {
    throw new AppError("VALIDATION_ERROR", "请输入基金代码", 400);
  }

  const known = KNOWN_FUNDS.find((fund) => fund.code === cleaned || fund.normalizedSymbol === cleaned);
  if (known && !type && !market) return known.normalizedSymbol;

  if (cleaned.endsWith(".FUND")) return cleaned;
  if (type === "mutual_fund" || (/^\d{6}$/.test(cleaned) && !market && !isLikelyCnEtf(cleaned))) {
    return `${cleaned.replace(/\.FUND$/, "")}.FUND`;
  }

  return normalizeSymbol(cleaned, market);
}

export function fundTypeFromSymbol(normalizedSymbol: string): FundType {
  return normalizedSymbol.endsWith(".FUND") ? "mutual_fund" : "etf";
}

export function fundFromSymbol(input: string, type?: FundType, market?: Market): FundSearchResult {
  const normalizedSymbol = normalizeFundSymbol(input, type, market);
  const known = KNOWN_FUNDS.find((fund) => fund.normalizedSymbol === normalizedSymbol);
  if (known) return known;

  if (normalizedSymbol.endsWith(".FUND")) {
    const code = normalizedSymbol.replace(/\.FUND$/, "");
    return {
      code,
      normalizedSymbol,
      type: "mutual_fund",
      name: code,
      currency: "CNY",
    };
  }

  const security = securityFromSymbol(normalizedSymbol);
  return {
    code: security.symbol,
    normalizedSymbol,
    type: "etf",
    market: marketFromSymbol(normalizedSymbol),
    name: security.name,
    currency: security.currency,
  };
}

export function searchKnownFunds(keyword: string): FundSearchResult[] {
  const query = keyword.trim().toUpperCase();
  return KNOWN_FUNDS.filter((fund) => {
    const haystack = [fund.code, fund.normalizedSymbol, fund.name].map((value) => value.toUpperCase());
    return !query || haystack.some((value) => value.includes(query));
  });
}

function isLikelyCnEtf(code: string) {
  return code.startsWith("15") || code.startsWith("16") || code.startsWith("51") || code.startsWith("56") || code.startsWith("58");
}
