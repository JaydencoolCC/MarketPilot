"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/i18n/locale-provider";
import type { FundHolding, FundRow, FundSearchResult, FundSnapshot } from "@/lib/domain/types";
import { fundDetailUrl } from "@/lib/domain/xueqiu";
import { cn } from "@/lib/utils/cn";
import { formatClockTime, formatCurrency, formatPercent } from "@/lib/utils/format";
import { localizedApiMessage } from "@/lib/i18n";

type FundTableProps = {
  initialRows: FundRow[];
};

function usableSnapshot(snapshot: FundSnapshot | null | undefined) {
  if (!snapshot || (snapshot.status === "error" && snapshot.netValue <= 0)) return null;
  return snapshot;
}

export function FundTable({ initialRows }: FundTableProps) {
  const { locale, t } = useLocale();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FundSearchResult[]>([]);
  const [selectedFund, setSelectedFund] = useState<FundSearchResult | null>(null);
  const [filter, setFilter] = useState<"ALL" | "mutual_fund" | "etf">("ALL");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState(t.fundTable.initialMessage);
  const [selectedRow, setSelectedRow] = useState<FundRow | null>(null);
  const pollingRef = useRef(false);
  const rowsRef = useRef(initialRows);
  const searchRequestRef = useRef(0);

  const filteredRows = useMemo(
    () => rows.filter((row) => (filter === "ALL" ? true : row.type === filter)),
    [rows, filter],
  );

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const mergeSnapshots = useCallback((snapshots: FundSnapshot[]) => {
    const snapshotBySymbol = new Map(snapshots.map((snapshot) => [snapshot.symbol, snapshot]));
    setRows((current) =>
      current.map((row) => {
        const snapshot = snapshotBySymbol.get(row.normalizedSymbol);
        if (!snapshot) return row;
        return { ...row, snapshot, dataStatus: snapshot.status };
      }),
    );
    setSelectedRow((current) => {
      if (!current) return null;
      const snapshot = snapshotBySymbol.get(current.normalizedSymbol);
      if (!snapshot) return current;
      return { ...current, snapshot, dataStatus: snapshot.status };
    });
  }, []);

  const fetchSnapshots = useCallback(async () => {
    if (pollingRef.current) return;
    const symbols = rowsRef.current.map((row) => row.normalizedSymbol);
    if (!symbols.length) return;
    pollingRef.current = true;
    try {
      const response = await fetch(`/api/funds/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: FundSnapshot[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.fundTable.refreshFailed));
        return;
      }
      mergeSnapshots(payload.data ?? []);
    } catch {
      setMessage(t.fundTable.refreshFailed);
    } finally {
      pollingRef.current = false;
    }
  }, [locale, mergeSnapshots, t.fundTable.refreshFailed]);

  const fetchRows = useCallback(async (options?: { showLoading?: boolean; updateMessage?: boolean }) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    if (options?.showLoading) setLoading(true);
    try {
      const response = await fetch("/api/funds", { cache: "no-store" });
      const payload = (await response.json()) as { data?: FundRow[]; error?: { message: string } };
      if (!response.ok) {
        if (options?.updateMessage) {
          setMessage(localizedApiMessage(locale, payload.error?.message, t.fundTable.refreshFailed));
        }
        return;
      }
      setRows(payload.data ?? []);
      setSelectedRow((current) => {
        if (!current) return null;
        return payload.data?.find((row) => row.id === current.id) ?? null;
      });
      if (options?.updateMessage) setMessage(t.fundTable.refreshed);
    } catch {
      if (options?.updateMessage) setMessage(t.fundTable.refreshFailed);
    } finally {
      pollingRef.current = false;
      if (options?.showLoading) setLoading(false);
    }
  }, [locale, t.fundTable.refreshed, t.fundTable.refreshFailed]);

  useEffect(() => {
    void fetchSnapshots();
    const interval = window.setInterval(() => {
      void fetchSnapshots();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [fetchSnapshots]);

  async function searchFunds(value: string) {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setQuery(value);
    setSelectedFund(null);
    if (!value.trim()) {
      searchRequestRef.current += 1;
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/funds/search?q=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: FundSearchResult[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.fundTable.searchFailed));
        return;
      }
      if (requestId !== searchRequestRef.current) return;
      setSuggestions(payload.data ?? []);
      if (!payload.data?.length) setMessage(t.fundTable.noMatch);
    } catch {
      if (requestId === searchRequestRef.current) setMessage(t.fundTable.searchFailed);
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false);
    }
  }

  async function addFund(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = selectedFund?.normalizedSymbol ?? query.trim();
    if (!symbol) {
      setMessage(t.fundTable.enterSymbol);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, type: selectedFund?.type, name: selectedFund?.name }),
      });
      const payload = (await response.json()) as {
        data?: FundRow;
        funds?: FundRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.fundTable.addFailed));
        return;
      }
      setRows(payload.funds ?? []);
      setQuery("");
      setSuggestions([]);
      setSelectedFund(null);
      setMessage(t.fundTable.added(payload.data?.name ?? symbol));
    } finally {
      setLoading(false);
    }
  }

  async function removeFund(id: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/funds/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { data?: FundRow[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.fundTable.deleteFailed));
        return;
      }
      setRows(payload.data ?? []);
      setSelectedRow((current) => (current?.id === id ? null : current));
      setMessage(t.fundTable.removed);
    } finally {
      setLoading(false);
    }
  }

  function chooseFund(fund: FundSearchResult) {
    setSelectedFund(fund);
    setQuery(fund.normalizedSymbol);
    setSuggestions([]);
    setMessage(t.fundTable.selected(fund.name));
  }

  return (
    <section className="relative rounded-lg border border-line bg-white/85 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.fundTable.title}</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "mutual_fund", "etf"] as const).map((item) => (
            <Button
              key={item}
              variant={filter === item ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilter(item)}
            >
              {item === "ALL" ? t.common.all : t.common.fundType[item]}
            </Button>
          ))}
          <Button variant="secondary" size="icon" aria-label={t.fundTable.refreshAria} onClick={() => fetchRows({ showLoading: true, updateMessage: true })}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <form onSubmit={addFund} className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <Input
            value={query}
            onChange={(event) => void searchFunds(event.target.value)}
            placeholder={t.fundTable.searchPlaceholder}
            aria-label={t.fundTable.searchAria}
            className="pl-9"
            autoComplete="off"
          />
          {suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-12 z-20 max-h-96 overflow-y-auto rounded-lg border border-line bg-white shadow-soft">
              {suggestions.map((fund) => (
                <button
                  key={fund.normalizedSymbol}
                  type="button"
                  className="flex min-h-[68px] w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-left last:border-b-0 hover:bg-moss/5"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseFund(fund);
                  }}
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">{fund.name}</span>
                    <span className="mt-1 block text-xs text-muted">{fund.normalizedSymbol}</span>
                  </span>
                  <Badge tone="blue">{t.common.fundType[fund.type]}</Badge>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button type="submit" disabled={loading || searching || !query.trim()}>
          <Plus className="h-4 w-4" />
          {selectedFund ? t.common.add : searching ? t.common.searching : t.common.directAdd}
        </Button>
        {selectedFund ? (
          <div className="md:col-span-2 flex items-center gap-2 text-sm text-moss">
            <Check className="h-4 w-4" />
            {t.fundTable.selectedInline(selectedFund.name, selectedFund.normalizedSymbol)}
          </div>
        ) : null}
      </form>

      {filteredRows.length === 0 ? (
        <div className="p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-moss">
            <Plus className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">{t.fundTable.emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            {t.fundTable.emptyBody}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-surface/80 text-xs uppercase tracking-normal text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t.common.name}</th>
                <th className="px-4 py-3 font-medium">{t.common.symbol}</th>
                <th className="px-4 py-3 font-medium">{t.common.type}</th>
                <th className="px-4 py-3 font-medium">{t.fundTable.columns.latestValue}</th>
                <th className="px-4 py-3 font-medium">{t.fundTable.columns.estimate}</th>
                <th className="px-4 py-3 font-medium">{t.fundTable.columns.changePercent}</th>
                <th className="px-4 py-3 font-medium">{t.common.updateTime}</th>
                <th className="px-4 py-3 font-medium">{t.common.data}</th>
                <th className="px-4 py-3 font-medium">{t.common.source}</th>
                <th className="px-4 py-3 text-right font-medium">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const snapshot = usableSnapshot(row.snapshot);
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
                      <Badge tone="blue">{t.common.fundType[row.type]}</Badge>
                    </td>
                    <td className="px-4 py-4 font-medium text-ink">
                      {snapshot ? formatCurrency(snapshot.netValue, snapshot.currency) : t.common.waitUpdate}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {snapshot?.estimateValue ? formatCurrency(snapshot.estimateValue, snapshot.currency) : "-"}
                    </td>
                    <td className={cn("px-4 py-4 font-semibold", changeColorClass(snapshot?.changePercent))}>
                      {snapshot ? formatPercent(snapshot.changePercent) : "-"}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {snapshot ? formatClockTime(snapshot.fetchedAt ?? snapshot.quoteTime) : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={row.dataStatus === "ok" ? "green" : row.dataStatus === "error" ? "red" : "amber"}>
                        {t.common.dataStatus[row.dataStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone="blue">{snapshot?.provider ?? "-"}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <a
                          href={fundDetailUrl(row.normalizedSymbol)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t.common.details}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t.common.delete}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeFund(row.id);
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
      {selectedRow ? <FundDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  );
}

function changeColorClass(changePercent?: number) {
  if (!changePercent) return "text-muted";
  return changePercent > 0 ? "text-coral" : "text-moss";
}

function FundDetailDrawer({
  row,
  onClose,
}: {
  row: FundRow;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const snapshot = usableSnapshot(row.snapshot);
  const [holdingsState, setHoldingsState] = useState<{
    holdings: FundHolding[];
    status: string;
  }>({ holdings: [], status: t.fundTable.drawer.loadingHoldings });

  useEffect(() => {
    let active = true;
    async function loadHoldings() {
      try {
        const response = await fetch(`/api/funds/holdings?symbol=${encodeURIComponent(row.normalizedSymbol)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { data?: FundHolding[]; error?: { message: string } };
        if (!active) return;
        if (!response.ok) {
          setHoldingsState({
            holdings: [],
            status: localizedApiMessage(locale, payload.error?.message, t.fundTable.drawer.holdingsFailed),
          });
          return;
        }
        const holdings = payload.data ?? [];
        setHoldingsState({
          holdings,
          status: holdings.length
            ? t.fundTable.drawer.holdingsFound(holdings.length, holdings[0]?.asOfDate)
            : t.fundTable.drawer.holdingsEmpty,
        });
      } catch {
        if (active) setHoldingsState({ holdings: [], status: t.fundTable.drawer.holdingsRetry });
      }
    }

    void loadHoldings();
    return () => {
      active = false;
    };
  }, [locale, row.normalizedSymbol, t.fundTable.drawer]);

  return (
    <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <p className="text-sm font-medium text-moss">{t.common.fundType[row.type]}</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{row.name}</h3>
            <p className="mt-1 font-mono text-xs text-muted">{row.normalizedSymbol}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label={t.common.close} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h4 className="text-sm font-semibold text-ink">{t.fundTable.drawer.basicInfo}</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric label={t.common.type} value={t.common.fundType[row.type]} />
              <Metric label={t.common.symbol} value={row.normalizedSymbol} />
              <Metric label={t.common.market} value={row.market ? t.common.markets[row.market] : t.fundTable.drawer.netValueFund} />
              <Metric label={t.fundTable.drawer.currency} value={row.currency} />
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-ink">{t.fundTable.drawer.latestStatus}</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric
                label={row.type === "mutual_fund" ? t.fundTable.drawer.latestNetValue : t.fundTable.drawer.latestPrice}
                value={snapshot ? formatCurrency(snapshot.netValue, snapshot.currency) : t.common.waitUpdate}
              />
              <Metric
                label={t.fundTable.columns.changePercent}
                value={snapshot ? formatPercent(snapshot.changePercent) : "-"}
                className={changeColorClass(snapshot?.changePercent)}
              />
              <Metric
                label={t.fundTable.columns.estimate}
                value={snapshot?.estimateValue ? formatCurrency(snapshot.estimateValue, snapshot.currency) : "-"}
              />
              <Metric
                label={t.common.updateTime}
                value={snapshot ? formatClockTime(snapshot.fetchedAt ?? snapshot.quoteTime) : "-"}
              />
            </div>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">{t.fundTable.drawer.dataSource}</h4>
            <p className="mt-2 text-sm leading-6 text-muted">
              {t.fundTable.drawer.sourceLine(snapshot?.provider ?? t.common.waitUpdate, t.common.dataStatus[row.dataStatus])}
              {snapshot?.errorMessage ? ` ${snapshot.errorMessage}` : ""}
            </p>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">{t.fundTable.drawer.holdings}</h4>
            <p className="mt-2 text-sm leading-6 text-muted">{holdingsState.status}</p>
            {holdingsState.holdings.length ? (
              <div className="mt-3 overflow-hidden rounded-md border border-line bg-white">
                <div className="grid grid-cols-[36px_1fr_64px] gap-2 border-b border-line bg-surface/70 px-3 py-2 text-xs font-medium text-muted">
                  <span>{t.fundTable.drawer.rank}</span>
                  <span>{t.common.name}</span>
                  <span className="text-right">{t.fundTable.drawer.weight}</span>
                </div>
                <div className="divide-y divide-line/70">
                  {holdingsState.holdings.map((holding) => (
                    <div key={`${holding.rank}-${holding.symbol}`} className="grid grid-cols-[36px_1fr_64px] gap-2 px-3 py-2 text-sm">
                      <span className="text-muted">{holding.rank}</span>
                      <span>
                        <span className="block font-medium text-ink">{holding.name}</span>
                        <span className="mt-0.5 block font-mono text-xs text-muted">{holding.symbol}</span>
                      </span>
                      <span className="text-right font-semibold text-ink">{holding.weightPercent.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
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
      <div className={cn("mt-1 break-words text-sm font-semibold text-ink", className)}>{value}</div>
    </div>
  );
}
