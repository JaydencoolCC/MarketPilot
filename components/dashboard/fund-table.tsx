"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FundHolding, FundRow, FundSearchResult, FundSnapshot } from "@/lib/domain/types";
import { xueqiuFundUrl } from "@/lib/domain/xueqiu";
import { cn } from "@/lib/utils/cn";
import { formatClockTime, formatCurrency, formatPercent } from "@/lib/utils/format";

type FundTableProps = {
  initialRows: FundRow[];
};

export function FundTable({ initialRows }: FundTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FundSearchResult[]>([]);
  const [selectedFund, setSelectedFund] = useState<FundSearchResult | null>(null);
  const [filter, setFilter] = useState<"ALL" | "mutual_fund" | "etf">("ALL");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("我会整理基金净值、ETF 行情和数据状态。");
  const [selectedRow, setSelectedRow] = useState<FundRow | null>(null);
  const pollingRef = useRef(false);
  const rowsRef = useRef(initialRows);

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
      const payload = (await response.json()) as { data?: FundSnapshot[] };
      mergeSnapshots(payload.data ?? []);
    } finally {
      pollingRef.current = false;
    }
  }, [mergeSnapshots]);

  const fetchRows = useCallback(async (options?: { showLoading?: boolean; updateMessage?: boolean }) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    if (options?.showLoading) setLoading(true);
    try {
      const response = await fetch("/api/funds", { cache: "no-store" });
      const payload = (await response.json()) as { data?: FundRow[] };
      setRows(payload.data ?? []);
      setSelectedRow((current) => {
        if (!current) return null;
        return payload.data?.find((row) => row.id === current.id) ?? null;
      });
      if (options?.updateMessage) setMessage("已更新基金状态。");
    } finally {
      pollingRef.current = false;
      if (options?.showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchSnapshots();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [fetchSnapshots]);

  async function searchFunds(value: string) {
    setQuery(value);
    setSelectedFund(null);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/funds/search?q=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: FundSearchResult[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "搜索暂时不可用。");
        return;
      }
      setSuggestions(payload.data ?? []);
      if (!payload.data?.length) setMessage("没有找到匹配基金，可以直接输入基金代码或 ETF 代码。");
    } finally {
      setSearching(false);
    }
  }

  async function addFund(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = selectedFund?.normalizedSymbol ?? query.trim();
    if (!symbol) {
      setMessage("请输入基金代码或 ETF 代码。");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, type: selectedFund?.type }),
      });
      const payload = (await response.json()) as {
        data?: FundRow;
        funds?: FundRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "添加失败，请稍后重试。");
        return;
      }
      setRows(payload.funds ?? []);
      setQuery("");
      setSuggestions([]);
      setSelectedFund(null);
      setMessage(`已添加 ${payload.data?.name ?? symbol}，我会开始跟踪它。`);
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
        setMessage(payload.error?.message ?? "删除失败，请稍后重试。");
        return;
      }
      setRows(payload.data ?? []);
      setSelectedRow((current) => (current?.id === id ? null : current));
      setMessage("已从自选基金中移除。");
    } finally {
      setLoading(false);
    }
  }

  function chooseFund(fund: FundSearchResult) {
    setSelectedFund(fund);
    setQuery(fund.normalizedSymbol);
    setSuggestions([]);
    setMessage(`已选择 ${fund.name}，点击添加即可加入自选基金。`);
  }

  return (
    <section className="relative rounded-lg border border-line bg-white/85 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">自选基金</h2>
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
              {item === "ALL" ? "全部" : item === "mutual_fund" ? "公募基金" : "ETF"}
            </Button>
          ))}
          <Button variant="secondary" size="icon" aria-label="刷新基金" onClick={() => fetchRows({ showLoading: true, updateMessage: true })}>
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
            placeholder="搜索基金或 ETF，例如 110022、510300、SPY、2800.HK"
            aria-label="搜索基金"
            className="pl-9"
            autoComplete="off"
          />
          {suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-12 z-20 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
              {suggestions.map((fund) => (
                <button
                  key={fund.normalizedSymbol}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-left last:border-b-0 hover:bg-moss/5"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseFund(fund);
                  }}
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">{fund.name}</span>
                    <span className="mt-1 block text-xs text-muted">{fund.normalizedSymbol}</span>
                  </span>
                  <Badge tone="blue">{fund.type === "mutual_fund" ? "公募基金" : "ETF"}</Badge>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button type="submit" disabled={loading || searching || !query.trim()}>
          <Plus className="h-4 w-4" />
          {selectedFund ? "添加" : searching ? "搜索中" : "直接添加"}
        </Button>
        {selectedFund ? (
          <div className="md:col-span-2 flex items-center gap-2 text-sm text-moss">
            <Check className="h-4 w-4" />
            已选择 {selectedFund.name} · {selectedFund.normalizedSymbol}
          </div>
        ) : null}
      </form>

      {filteredRows.length === 0 ? (
        <div className="p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-moss">
            <Plus className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">还没有自选基金</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            添加基金或 ETF 后，我会开始整理净值、价格和最新状态。可以先试试 110022、510300 或 SPY。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-surface/80 text-xs uppercase tracking-normal text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">代码</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">最新值</th>
                <th className="px-4 py-3 font-medium">估值</th>
                <th className="px-4 py-3 font-medium">涨跌幅</th>
                <th className="px-4 py-3 font-medium">更新时间</th>
                <th className="px-4 py-3 font-medium">数据</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const snapshot = row.snapshot;
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
                      <Badge tone="blue">{row.type === "mutual_fund" ? "公募基金" : "ETF"}</Badge>
                    </td>
                    <td className="px-4 py-4 font-medium text-ink">
                      {snapshot ? formatCurrency(snapshot.netValue, snapshot.currency) : "等待更新"}
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
                        {row.dataStatus === "ok" ? "正常" : row.dataStatus === "error" ? "失败" : "待更新"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone="blue">{snapshot?.provider ?? "-"}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <a
                          href={xueqiuFundUrl(row.normalizedSymbol)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="查看详情"
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
                          aria-label="删除"
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

function fundTypeLabel(type: FundRow["type"]) {
  return type === "mutual_fund" ? "公募基金" : "ETF";
}

function FundDetailDrawer({
  row,
  onClose,
}: {
  row: FundRow;
  onClose: () => void;
}) {
  const snapshot = row.snapshot;
  const [holdingsState, setHoldingsState] = useState<{
    holdings: FundHolding[];
    status: string;
  }>({ holdings: [], status: "正在读取基金组成成分。" });

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
          setHoldingsState({ holdings: [], status: payload.error?.message ?? "基金组成成分暂时不可用。" });
          return;
        }
        const holdings = payload.data ?? [];
        setHoldingsState({
          holdings,
          status: holdings.length
            ? `前 ${holdings.length} 大持仓，${holdings[0]?.asOfDate ? `截止 ${holdings[0].asOfDate}` : "按数据源最新披露"}。`
            : "数据源暂未返回这只基金的组成成分。",
        });
      } catch {
        if (active) setHoldingsState({ holdings: [], status: "基金组成成分暂时不可用，稍后可以再试。" });
      }
    }

    void loadHoldings();
    return () => {
      active = false;
    };
  }, [row.normalizedSymbol]);

  return (
    <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <p className="text-sm font-medium text-moss">{fundTypeLabel(row.type)}</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{row.name}</h3>
            <p className="mt-1 font-mono text-xs text-muted">{row.normalizedSymbol}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭详情" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h4 className="text-sm font-semibold text-ink">基本信息</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric label="类型" value={fundTypeLabel(row.type)} />
              <Metric label="代码" value={row.normalizedSymbol} />
              <Metric label="市场" value={row.market ?? "净值型基金"} />
              <Metric label="币种" value={row.currency} />
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-ink">最新状态</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric
                label={row.type === "mutual_fund" ? "最新净值" : "最新价格"}
                value={snapshot ? formatCurrency(snapshot.netValue, snapshot.currency) : "等待更新"}
              />
              <Metric
                label="涨跌幅"
                value={snapshot ? formatPercent(snapshot.changePercent) : "-"}
                className={changeColorClass(snapshot?.changePercent)}
              />
              <Metric
                label="估值"
                value={snapshot?.estimateValue ? formatCurrency(snapshot.estimateValue, snapshot.currency) : "-"}
              />
              <Metric
                label="更新时间"
                value={snapshot ? formatClockTime(snapshot.fetchedAt ?? snapshot.quoteTime) : "-"}
              />
            </div>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">数据来源</h4>
            <p className="mt-2 text-sm leading-6 text-muted">
              当前来源：{snapshot?.provider ?? "等待更新"}。数据状态：
              {row.dataStatus === "ok" ? "正常" : row.dataStatus === "error" ? "失败" : "待更新"}。
              {snapshot?.errorMessage ? ` ${snapshot.errorMessage}` : ""}
            </p>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">基金组成成分</h4>
            <p className="mt-2 text-sm leading-6 text-muted">{holdingsState.status}</p>
            {holdingsState.holdings.length ? (
              <div className="mt-3 overflow-hidden rounded-md border border-line bg-white">
                <div className="grid grid-cols-[36px_1fr_64px] gap-2 border-b border-line bg-surface/70 px-3 py-2 text-xs font-medium text-muted">
                  <span>序号</span>
                  <span>名称</span>
                  <span className="text-right">占比</span>
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
