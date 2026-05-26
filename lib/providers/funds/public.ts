import { AppError } from "@/lib/domain/errors";
import { fundFromSymbol, fundTypeFromSymbol, normalizeFundSymbol, searchKnownFunds } from "@/lib/domain/funds";
import type { FundHolding, FundSearchResult, FundSnapshot } from "@/lib/domain/types";
import { getQuoteProvider } from "@/lib/providers/quotes";
import type { FundProvider } from "@/lib/providers/funds/types";

type EastmoneyFundQuote = {
  fundcode?: string;
  name?: string;
  jzrq?: string;
  dwjz?: string;
  gsz?: string;
  gszzl?: string;
  gztime?: string;
};

type EastmoneyFundSearchItem = {
  CODE?: string;
  NAME?: string;
  FundBaseInfo?: {
    FCODE?: string;
    SHORTNAME?: string;
    FTYPE?: string;
  };
};

type EastmoneyFundSearchResponse = {
  Datas?: EastmoneyFundSearchItem[];
};

export class PublicFundProvider implements FundProvider {
  async searchFunds(keyword: string): Promise<FundSearchResult[]> {
    const query = keyword.trim();
    const known = searchKnownFunds(query);
    const remote = await searchEastmoneyFunds(query).catch(() => []);
    return mergeFunds(remote, known).slice(0, 12);
  }

  async getFundSnapshots(symbols: string[]): Promise<FundSnapshot[]> {
    return Promise.all(symbols.map((symbol) => this.getSnapshot(symbol)));
  }

  async getFundHoldings(symbol: string): Promise<FundHolding[]> {
    const normalizedSymbol = normalizeFundSymbol(symbol);
    if (fundTypeFromSymbol(normalizedSymbol) === "etf") return [];
    return fetchEastmoneyFundHoldings(normalizedSymbol);
  }

  private async getSnapshot(symbol: string): Promise<FundSnapshot> {
    const normalizedSymbol = normalizeFundSymbol(symbol);
    if (fundTypeFromSymbol(normalizedSymbol) === "etf") {
      const [quote] = await getQuoteProvider().getQuotes([normalizedSymbol]);
      return {
        symbol: normalizedSymbol,
        netValue: quote?.price ?? 0,
        changePercent: quote?.changePercent ?? 0,
        currency: quote?.currency ?? fundFromSymbol(normalizedSymbol).currency,
        provider: quote?.provider ?? "quote",
        quoteTime: quote?.quoteTime ?? new Date().toISOString(),
        status: quote?.status ?? "error",
        errorCode: quote?.errorCode,
        errorMessage: quote?.errorMessage,
      };
    }

    try {
      return await fetchEastmoneyFundSnapshot(normalizedSymbol);
    } catch (error) {
      const message = error instanceof Error ? error.message : "基金数据暂时不可用。";
      const fund = fundFromSymbol(normalizedSymbol, "mutual_fund");
      return {
        symbol: normalizedSymbol,
        netValue: 0,
        changePercent: 0,
        currency: fund.currency,
        provider: "eastmoney",
        quoteTime: new Date().toISOString(),
        status: "error",
        errorCode: "PROVIDER_UNAVAILABLE",
        errorMessage: `基金数据暂时不可用。${message}`,
      };
    }
  }
}

async function searchEastmoneyFunds(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword) return [];
  const url = new URL("https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx");
  url.searchParams.set("m", "1");
  url.searchParams.set("key", keyword);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Referer: "https://fund.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `东方财富基金搜索请求失败：${response.status}`, 503);
  }

  const payload = (await response.json()) as EastmoneyFundSearchResponse;
  return (payload.Datas ?? []).flatMap((item) => {
    const code = item.FundBaseInfo?.FCODE ?? item.CODE;
    if (!code || !/^\d{6}$/.test(code)) return [];
    const name = item.FundBaseInfo?.SHORTNAME ?? item.NAME ?? code;
    const exchange = listedEtfExchange(code, name);
    const type = exchange ? "etf" : "mutual_fund";
    const market = exchange ? "CN" : undefined;
    return [
      {
        code,
        normalizedSymbol: exchange ? `${code}.${exchange}` : `${code}.FUND`,
        type,
        market,
        name,
        currency: "CNY",
      } satisfies FundSearchResult,
    ];
  });
}

async function fetchEastmoneyFundSnapshot(normalizedSymbol: string): Promise<FundSnapshot> {
  const fund = fundFromSymbol(normalizedSymbol, "mutual_fund");
  const code = fund.code;
  const url = new URL(`https://fundgz.1234567.com.cn/js/${code}.js`);
  url.searchParams.set("rt", Date.now().toString());

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Referer: "https://fund.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `东方财富基金请求失败：${response.status}`, 503);
  }

  const text = await response.text();
  const payload = parseEastmoneyFundJson(text);
  const netValue = toNumber(payload.dwjz);
  const estimateValue = toNumber(payload.gsz);
  const changePercent = toNumber(payload.gszzl);
  const quoteTime = parseFundTime(payload.gztime || payload.jzrq);

  return {
    symbol: normalizedSymbol,
    netValue: netValue || estimateValue,
    estimateValue: estimateValue || undefined,
    changePercent,
    currency: "CNY",
    provider: "eastmoney",
    quoteTime,
    status: "ok",
  };
}

async function fetchEastmoneyFundHoldings(normalizedSymbol: string): Promise<FundHolding[]> {
  const fund = fundFromSymbol(normalizedSymbol, "mutual_fund");
  const url = new URL("https://fundf10.eastmoney.com/FundArchivesDatas.aspx");
  url.searchParams.set("type", "jjcc");
  url.searchParams.set("code", fund.code);
  url.searchParams.set("topline", "10");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Referer: `https://fundf10.eastmoney.com/jjcc_${fund.code}.html`,
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `东方财富基金持仓请求失败：${response.status}`, 503);
  }

  const text = await response.text();
  return parseEastmoneyFundHoldings(text);
}

function parseEastmoneyFundJson(text: string): EastmoneyFundQuote {
  const json = text.match(/jsonpgz\((.*)\);?/)?.[1];
  if (!json) {
    throw new AppError("PROVIDER_UNAVAILABLE", "东方财富基金没有返回可用数据。", 503);
  }
  return JSON.parse(json) as EastmoneyFundQuote;
}

function parseEastmoneyFundHoldings(text: string): FundHolding[] {
  const content = text.match(/content:"([\s\S]*)",arryear:/)?.[1] ?? text.match(/content:"([\s\S]*)"\s*}/)?.[1];
  if (!content) {
    throw new AppError("PROVIDER_UNAVAILABLE", "东方财富基金持仓没有返回可用数据。", 503);
  }
  const html = unescapeEastmoneyHtml(content);
  const asOfDate = html.match(/截止至：<font class='px12'>([^<]+)<\/font>/)?.[1];
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  return rows
    .map((row) => row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [])
    .filter((cells) => cells.length >= 9)
    .map((cells) => {
      const rank = Number(stripHtml(cells[0]));
      const symbol = stripHtml(cells[1]);
      const name = stripHtml(cells[2]);
      const weightPercent = Number(stripHtml(cells[6]).replace("%", ""));
      const shares = toOptionalNumber(stripHtml(cells[7]).replace(/,/g, ""));
      const marketValue = toOptionalNumber(stripHtml(cells[8]).replace(/,/g, ""));
      return {
        rank,
        symbol,
        name,
        weightPercent: Number.isFinite(weightPercent) ? weightPercent : 0,
        shares,
        marketValue,
        asOfDate,
        provider: "eastmoney",
      };
    })
    .filter((holding) => holding.rank && holding.symbol && holding.name);
}

function unescapeEastmoneyHtml(value: string) {
  return value.replace(/\\"/g, "\"").replace(/\\\//g, "/").replace(/\\r|\\n|\\t/g, "");
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function mergeFunds(...groups: FundSearchResult[][]) {
  const results = new Map<string, FundSearchResult>();
  for (const group of groups) {
    for (const fund of group) {
      results.set(fund.normalizedSymbol, fund);
    }
  }
  return [...results.values()];
}

function listedEtfExchange(code: string, name: string) {
  if (!/ETF/i.test(name) || name.includes("联接")) return undefined;
  if (code.startsWith("51") || code.startsWith("56") || code.startsWith("58")) return "SH" as const;
  if (code.startsWith("15") || code.startsWith("16")) return "SZ" as const;
  return undefined;
}

function toNumber(value: string | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toOptionalNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseFundTime(value: string | undefined) {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T15:00:00+08:00`).toISOString();
  return new Date(value.replace(" ", "T") + "+08:00").toISOString();
}
