import { AppError } from "@/lib/domain/errors";
import { fundFromSymbol, fundTypeFromSymbol, normalizeFundSymbol, searchKnownFunds } from "@/lib/domain/funds";
import type { FundHolding, FundSearchResult, FundSnapshot } from "@/lib/domain/types";
import { marketDataFetch } from "@/lib/providers/market-data-network";
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

type EastmoneyFundCodeListItem = [
  code?: string,
  pinyin?: string,
  name?: string,
  fundType?: string,
  pinyinInitials?: string,
];

export class PublicFundProvider implements FundProvider {
  async searchFunds(keyword: string): Promise<FundSearchResult[]> {
    const query = keyword.trim();
    const known = searchKnownFunds(query);
    const results = await Promise.allSettled([
      searchEastmoneyFunds(query),
      searchEastmoneyFundCodeList(query),
      searchSinaListedFunds(query),
    ]);
    const remote = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    return rankFunds(mergeFunds(remote, known), query).slice(0, 20);
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

  const response = await marketDataFetch(url, {
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

async function searchEastmoneyFundCodeList(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword) return [];
  const url = new URL("https://fund.eastmoney.com/js/fundcode_search.js");
  const response = await marketDataFetch(url, {
    cache: "no-store",
    headers: {
      Referer: "https://fund.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `东方财富基金列表请求失败：${response.status}`, 503);
  }

  const text = await response.text();
  const list = parseEastmoneyFundCodeList(text);
  const query = keyword.trim().toUpperCase();
  return list
    .filter((item) => {
      const [code, pinyin, name, fundType, pinyinInitials] = item;
      const haystack = [code, pinyin, name, fundType, pinyinInitials]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toUpperCase());
      return haystack.some((value) => value.includes(query));
    })
    .flatMap((item) => {
      const [code, _pinyin, name] = item;
      if (!code || !name || !/^\d{6}$/.test(code)) return [];
      return [{
        code,
        normalizedSymbol: `${code}.FUND`,
        type: "mutual_fund",
        name,
        currency: "CNY",
      } satisfies FundSearchResult];
    });
}

async function searchSinaListedFunds(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword) return [];
  const url = new URL("https://suggest3.sinajs.cn/suggest/type=");
  url.searchParams.set("key", keyword);
  url.searchParams.set("name", "suggestvalue");

  const response = await marketDataFetch(url, {
    cache: "no-store",
    headers: {
      Referer: "https://finance.sina.com.cn/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new AppError("PROVIDER_UNAVAILABLE", `Sina 基金搜索请求失败：${response.status}`, 503);
  }

  const text = new TextDecoder("gb18030").decode(await response.arrayBuffer());
  return parseSinaListedFunds(text);
}

async function fetchEastmoneyFundSnapshot(normalizedSymbol: string): Promise<FundSnapshot> {
  const fund = fundFromSymbol(normalizedSymbol, "mutual_fund");
  const code = fund.code;
  const url = new URL(`https://fundgz.1234567.com.cn/js/${code}.js`);
  url.searchParams.set("rt", Date.now().toString());

  const response = await marketDataFetch(url, {
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

  const response = await marketDataFetch(url, {
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

function parseEastmoneyFundCodeList(text: string): EastmoneyFundCodeListItem[] {
  const json = text.match(/var\s+r\s*=\s*(\[[\s\S]*\]);?/)?.[1];
  if (!json) return [];
  return JSON.parse(json) as EastmoneyFundCodeListItem[];
}

function parseSinaListedFunds(text: string): FundSearchResult[] {
  const raw = text.match(/suggestvalue="([^"]*)"/)?.[1] ?? "";
  if (!raw) return [];

  return raw
    .split(";")
    .flatMap((item) => item.split("\\n"))
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap(parseSinaListedFund);
}

function parseSinaListedFund(item: string): FundSearchResult[] {
  const fields = item.split(",");
  const code = fields[2]?.trim();
  const marketCode = fields[3]?.trim().toLowerCase();
  const name = resolveSinaFundName(fields);
  if (!code || !marketCode || !name || !/^\d{6}$/.test(code)) return [];
  if (!isListedFundName(name)) return [];

  const exchange = marketCode.startsWith("sh") ? "SH" : marketCode.startsWith("sz") ? "SZ" : listedEtfExchange(code, name);
  if (!exchange) return [];

  return [{
    code,
    normalizedSymbol: `${code}.${exchange}`,
    type: "etf",
    market: "CN",
    name,
    currency: "CNY",
  }];
}

function resolveSinaFundName(fields: string[]) {
  const code = fields[2]?.trim();
  const marketCode = fields[3]?.trim();
  const codeLikeNames = new Set(
    [code, marketCode, code ? `${marketCode?.slice(0, 2) ?? ""}${code}` : undefined]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );

  return (
    [fields[4], fields[6], fields[0]]
      .filter((field): field is string => Boolean(field))
      .map((field) => field.trim())
      .find((field) => field && !codeLikeNames.has(field.toLowerCase()) && !/^[a-z]{0,3}\d{5,6}$/i.test(field)) ??
    fields[0]?.trim()
  );
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

function rankFunds(funds: FundSearchResult[], keyword: string) {
  const query = keyword.trim().toUpperCase();
  return [...funds].sort((left, right) => scoreFund(right, query) - scoreFund(left, query));
}

function scoreFund(fund: FundSearchResult, query: string) {
  const code = fund.code.toUpperCase();
  const symbol = fund.normalizedSymbol.toUpperCase();
  const name = fund.name.toUpperCase();
  let score = 0;
  if (code === query || symbol === query) score += 120;
  if (name === query) score += 100;
  if (code.startsWith(query) || symbol.startsWith(query)) score += 80;
  if (name.includes(query)) score += 60;
  if (fund.type === "etf" && /ETF/i.test(query)) score += 10;
  return score;
}

function listedEtfExchange(code: string, name: string) {
  if (!/ETF/i.test(name) || name.includes("联接")) return undefined;
  if (code.startsWith("51") || code.startsWith("56") || code.startsWith("58")) return "SH" as const;
  if (code.startsWith("15") || code.startsWith("16")) return "SZ" as const;
  return undefined;
}

function isListedFundName(name: string) {
  return /(ETF|REIT)/i.test(name) && !name.includes("联接");
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
