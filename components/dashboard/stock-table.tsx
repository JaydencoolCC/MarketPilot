"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, MessageCircle, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Market, NewsArticle, Quote, Security, WatchlistRow } from "@/lib/domain/types";
import { stockDetailUrl } from "@/lib/domain/xueqiu";
import { formatClockTime, formatCurrency, formatPercent, relativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { dictionary, localizedApiMessage } from "@/lib/i18n";

type StockTableProps = {
  initialRows: WatchlistRow[];
};

const QUOTE_POLL_INTERVAL_MS = 3000;

function changeColorClass(changePercent?: number) {
  if (!changePercent) return "text-muted";
  return changePercent > 0 ? "text-coral" : "text-moss";
}

function marketStatusTone(status?: Quote["marketStatus"]) {
  if (status === "open") return "green";
  if (status === "pre_market" || status === "after_hours") return "amber";
  return "neutral";
}

export function StockTable({ initialRows }: StockTableProps) {
  const { locale, t } = useLocale();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Security[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
  const [filter, setFilter] = useState<Market | "ALL">("ALL");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState(t.stockTable.initialMessage);
  const [selectedRow, setSelectedRow] = useState<WatchlistRow | null>(null);
  const pollingRef = useRef(false);
  const pendingManualRefreshRef = useRef(false);
  const rowsRef = useRef(initialRows);

  const filteredRows = useMemo(
    () => rows.filter((row) => (filter === "ALL" ? true : row.market === filter)),
    [rows, filter],
  );
  const latestFetchedAt = useMemo(() => {
    const timestamps = filteredRows
      .map((row) => row.quote?.quoteTime ?? row.quote?.fetchedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [filteredRows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    setMessage((current) =>
      current === dictionary[locale === "zh" ? "en" : "zh"].stockTable.initialMessage
        ? t.stockTable.initialMessage
        : current,
    );
  }, [locale, t.stockTable.initialMessage]);

  const mergeQuotes = useCallback((quotes: Quote[]) => {
    const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    setRows((current) =>
      current.map((row, index) => {
        const quote = quoteBySymbol.get(row.normalizedSymbol) ?? quotes[index];
        if (!quote) return row;
        return { ...row, quote, dataStatus: quote.status };
      }),
    );
    setSelectedRow((current) => {
      if (!current) return null;
      const currentIndex = rowsRef.current.findIndex((row) => row.id === current.id);
      const quote = quoteBySymbol.get(current.normalizedSymbol) ?? quotes[currentIndex];
      if (!quote) return current;
      return { ...current, quote, dataStatus: quote.status };
    });
  }, []);

  const fetchQuotes = useCallback(async (options?: { showLoading?: boolean; updateMessage?: boolean }) => {
    if (pollingRef.current) {
      if (options?.showLoading) pendingManualRefreshRef.current = true;
      return;
    }
    const symbols = rowsRef.current.map((row) => row.normalizedSymbol);
    if (!symbols.length) return;
    pollingRef.current = true;
    if (options?.showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: Quote[] };
      mergeQuotes(payload.data ?? []);
      if (options?.updateMessage) setMessage(t.stockTable.refreshed);
    } finally {
      pollingRef.current = false;
      if (options?.showLoading) setLoading(false);
      if (pendingManualRefreshRef.current) {
        pendingManualRefreshRef.current = false;
        void fetchQuotes({ showLoading: true, updateMessage: true });
      }
    }
  }, [mergeQuotes, t.stockTable.refreshed]);

  useEffect(() => {
    void fetchQuotes();
    const interval = window.setInterval(() => {
      void fetchQuotes();
    }, QUOTE_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchQuotes]);

  async function reloadRows() {
    await fetchQuotes({ showLoading: true, updateMessage: true });
  }

  async function addStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = selectedSecurity?.normalizedSymbol ?? query.trim();
    if (!symbol) {
      setMessage(t.stockTable.enterSymbol);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          market: selectedSecurity ? undefined : filter === "ALL" ? undefined : filter,
        }),
      });
      const payload = (await response.json()) as {
        data?: WatchlistRow;
        watchlist?: WatchlistRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.stockTable.addFailed));
        return;
      }
      setRows(payload.watchlist ?? []);
      setQuery("");
      setSuggestions([]);
      setSelectedSecurity(null);
      setMessage(t.stockTable.added(payload.data?.name ?? symbol));
    } finally {
      setLoading(false);
    }
  }

  async function fetchSecuritySuggestions(value: string, marketFilter: Market | "ALL") {
    setSearching(true);
    try {
      const params = new URLSearchParams({ q: value });
      if (marketFilter !== "ALL") params.set("market", marketFilter);
      const response = await fetch(`/api/securities/search?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: Security[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.stockTable.searchFailed));
        return;
      }
      setSuggestions(payload.data ?? []);
      if (!payload.data?.length) {
        setMessage(t.stockTable.noMatch);
      }
    } finally {
      setSearching(false);
    }
  }

  async function searchSecurities(value: string) {
    setQuery(value);
    setSelectedSecurity(null);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    await fetchSecuritySuggestions(value, filter);
  }

  function changeFilter(nextFilter: Market | "ALL") {
    setFilter(nextFilter);
    if (query.trim()) {
      setSuggestions([]);
      setSelectedSecurity(null);
      void fetchSecuritySuggestions(query, nextFilter);
    }
  }

  function chooseSecurity(security: Security) {
    setSelectedSecurity(security);
    setQuery(security.normalizedSymbol);
    setSuggestions([]);
    setMessage(t.stockTable.selected(security.name, t.common.markets[security.market]));
  }

  async function removeStock(id: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { data?: WatchlistRow[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.stockTable.deleteFailed));
        return;
      }
      setRows(payload.data ?? []);
      setSelectedRow((current) => (current?.id === id ? null : current));
      setMessage(t.stockTable.removed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative flex max-h-[calc(100vh-8.5rem)] min-h-[520px] flex-col overflow-hidden rounded-lg border border-line bg-white/85 shadow-soft">
      <div className="shrink-0 flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.stockTable.title}</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted">
            {t.common.updateTime}: {latestFetchedAt ? formatClockTime(latestFetchedAt) : "-"}
          </span>
          {(["ALL", "US", "HK", "CN", "JP"] as const).map((item) => (
            <Button
              key={item}
              variant={filter === item ? "primary" : "secondary"}
              size="sm"
              onClick={() => changeFilter(item)}
            >
              {item === "ALL" ? t.common.all : t.common.markets[item]}
            </Button>
          ))}
          <Button variant="secondary" size="icon" aria-label={t.stockTable.refreshAria} onClick={reloadRows}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <form onSubmit={addStock} className="shrink-0 grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <Input
            value={query}
            onChange={(event) => void searchSecurities(event.target.value)}
            placeholder={t.stockTable.searchPlaceholder}
            aria-label={t.stockTable.searchAria}
            className="pl-9"
            autoComplete="off"
          />
          {suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-12 z-20 max-h-96 overflow-y-auto rounded-lg border border-line bg-white shadow-soft">
              {suggestions.map((security) => (
                <button
                  key={security.normalizedSymbol}
                  type="button"
                  className="flex min-h-[68px] w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-left last:border-b-0 hover:bg-moss/5"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseSecurity(security);
                  }}
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">{security.name}</span>
                    <span className="mt-1 block text-xs text-muted">{security.normalizedSymbol}</span>
                  </span>
                  <Badge tone="blue">{t.common.markets[security.market]}</Badge>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button type="submit" disabled={loading || searching || !query.trim()}>
          <Plus className="h-4 w-4" />
          {selectedSecurity ? t.common.add : searching ? t.common.searching : t.common.directAdd}
        </Button>
        {selectedSecurity ? (
          <div className="md:col-span-2 flex items-center gap-2 text-sm text-moss">
            <Check className="h-4 w-4" />
            {t.stockTable.selectedInline(
              selectedSecurity.name,
              selectedSecurity.normalizedSymbol,
              t.common.markets[selectedSecurity.market],
            )}
          </div>
        ) : null}
      </form>

      {filteredRows.length === 0 ? (
        <div className="flex-1 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-moss">
            <Plus className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">{t.stockTable.emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            {t.stockTable.emptyBody}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-xs uppercase tracking-normal text-muted shadow-[0_1px_0_0_rgba(219,211,199,0.9)]">
              <tr>
                <th className="px-4 py-3 font-medium">{t.common.name}</th>
                <th className="px-4 py-3 font-medium">{t.common.symbol}</th>
                <th className="px-4 py-3 font-medium">{t.common.market}</th>
                <th className="px-4 py-3 font-medium">{t.stockTable.columns.price}</th>
                <th className="px-4 py-3 font-medium">{t.stockTable.columns.changePercent}</th>
                <th className="px-4 py-3 font-medium">{t.stockTable.columns.marketStatus}</th>
                <th className="px-4 py-3 font-medium">{t.stockTable.columns.news}</th>
                <th className="px-4 py-3 font-medium">{t.common.data}</th>
                <th className="px-4 py-3 font-medium">{t.common.source}</th>
                <th className="px-4 py-3 text-right font-medium">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const quote = row.quote;
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-line/70 hover:bg-moss/5"
                    onClick={() => setSelectedRow(row)}
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-ink">{row.name}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted">{row.normalizedSymbol}</td>
                    <td className="px-4 py-4">
                      <Badge tone="blue">{t.common.markets[row.market]}</Badge>
                    </td>
                    <td className="px-4 py-4 font-medium text-ink">
                      {quote ? formatCurrency(quote.price, quote.currency) : t.common.waitUpdate}
                    </td>
                    <td className={cn("px-4 py-4 font-semibold", changeColorClass(quote?.changePercent))}>
                      {quote ? formatPercent(quote.changePercent) : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={marketStatusTone(quote?.marketStatus)}>
                        {t.marketStatus[quote?.marketStatus ?? "unknown"]}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-muted">{t.stockTable.newsCount(row.todayNewsCount)}</td>
                    <td className="px-4 py-4">
                      <Badge
                        tone={
                          row.dataStatus === "ok"
                            ? "green"
                            : row.dataStatus === "error"
                              ? "red"
                              : "amber"
                        }
                      >
                        {t.common.dataStatus[row.dataStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={quote?.provider === "mock" ? "amber" : "blue"}>
                        {quote?.provider ?? "-"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <a
                          href={stockDetailUrl(row.normalizedSymbol)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t.common.details}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Info className="h-4 w-4" />
                        </a>
                        <Link
                          href={`/chat?q=${encodeURIComponent(t.stockTable.askQuestion(row.name))}`}
                          aria-label={t.stockTable.askChatAria}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t.common.delete}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeStock(row.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selectedRow ? (
        <StockDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
      ) : null}
    </section>
  );
}

function StockDetailDrawer({
  row,
  onClose,
}: {
  row: WatchlistRow;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const quote = row.quote;
  const question = t.stockTable.askQuestion(row.name);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [newsStatus, setNewsStatus] = useState(t.stockTable.drawer.loadingNews);

  useEffect(() => {
    let active = true;
    async function loadNews() {
      try {
        const response = await fetch(
          `/api/news?symbols=${encodeURIComponent(row.normalizedSymbol)}&hours=24`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          data?: NewsArticle[];
          error?: { message: string };
        };
        if (!active) return;
        if (!response.ok) {
          setNewsStatus(localizedApiMessage(locale, payload.error?.message, t.stockTable.drawer.newsFailed));
          return;
        }
        setArticles(payload.data ?? []);
        setNewsStatus(
          payload.data?.length
            ? t.stockTable.drawer.newsFound(payload.data.length)
            : t.stockTable.drawer.newsEmpty,
        );
      } catch {
        if (active) setNewsStatus(t.stockTable.drawer.newsRetry);
      }
    }
    void loadNews();
    return () => {
      active = false;
    };
  }, [locale, row.normalizedSymbol, t.stockTable.drawer]);

  return (
    <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <p className="text-sm font-medium text-moss">{t.common.markets[row.market]}</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{row.name}</h3>
            <p className="mt-1 font-mono text-xs text-muted">{row.normalizedSymbol}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label={t.common.close} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h4 className="text-sm font-semibold text-ink">{t.stockTable.drawer.latestQuote}</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric label={t.stockTable.columns.price} value={quote ? formatCurrency(quote.price, quote.currency) : t.common.waitUpdate} />
              <Metric
                label={t.stockTable.columns.changePercent}
                value={quote ? formatPercent(quote.changePercent) : "-"}
                className={changeColorClass(quote?.changePercent)}
              />
              <Metric label={t.stockTable.drawer.fetchedAt} value={quote ? formatClockTime(quote.fetchedAt ?? quote.quoteTime) : "-"} />
              <Metric label={t.stockTable.drawer.quoteTime} value={quote ? formatClockTime(quote.quoteTime) : "-"} />
              <Metric label={t.stockTable.columns.marketStatus} value={t.marketStatus[quote?.marketStatus ?? "unknown"]} />
            </div>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">{t.stockTable.drawer.dataSource}</h4>
            <p className="mt-2 text-sm leading-6 text-muted">
              {t.stockTable.drawer.sourceLine(
                quote?.provider ?? t.stockTable.drawer.waitingProvider,
                t.common.dataStatus[row.dataStatus],
              )}
              {quote?.errorMessage ? ` ${quote.errorMessage}` : ""}
            </p>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">{t.stockTable.drawer.relatedNews}</h4>
            <p className="mt-2 text-sm leading-6 text-muted">{newsStatus}</p>
            {articles.length ? (
              <div className="mt-3 space-y-3">
                {articles.slice(0, 4).map((article) => (
                  <a
                    key={article.id}
                    href={article.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md border border-line bg-white p-3 hover:border-moss/30 hover:bg-moss/5"
                  >
                    <div className="text-sm font-semibold leading-5 text-ink">{article.title}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{article.summary}</p>
                    <div className="mt-2 text-xs text-muted">
                      {article.source} · {relativeTime(article.publishedAt)}
                    </div>
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div className="border-t border-line p-5">
          <Link
            href={`/chat?q=${encodeURIComponent(question)}`}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90"
          >
            <MessageCircle className="h-4 w-4" />
            {t.stockTable.drawer.askStock}
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold text-ink", className)}>{value}</div>
    </div>
  );
}
