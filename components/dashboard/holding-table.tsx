"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BriefcaseBusiness, Eraser, Pencil, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Quote, WatchlistRow } from "@/lib/domain/types";
import { calculateStockHolding, hasStockHolding } from "@/lib/domain/holdings";
import { cnMarketName, formatCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type HoldingTableProps = {
  initialRows: WatchlistRow[];
};

function pnlColorClass(value?: number) {
  if (!value) return "text-muted";
  return value > 0 ? "text-coral" : "text-moss";
}

function signedCurrency(value: number, currency: string) {
  const formatted = formatCurrency(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function inputValue(value?: number) {
  return value ? String(value) : "";
}

export function HoldingTable({ initialRows }: HoldingTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [selectedId, setSelectedId] = useState(initialRows[0]?.id ?? "");
  const [costPrice, setCostPrice] = useState(inputValue(initialRows[0]?.costPrice));
  const [shares, setShares] = useState(inputValue(initialRows[0]?.shares));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("选择一只自选股，录入平均成本价和股票数。");
  const pollingRef = useRef(false);
  const rowsRef = useRef(initialRows);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const holdingRows = useMemo(() => rows.filter(hasStockHolding), [rows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const mergeQuotes = useCallback((quotes: Quote[]) => {
    const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    setRows((current) =>
      current.map((row) => {
        const quote = quoteBySymbol.get(row.normalizedSymbol);
        if (!quote) return row;
        return { ...row, quote, dataStatus: quote.status };
      }),
    );
  }, []);

  const fetchQuotes = useCallback(async () => {
    if (pollingRef.current) return;
    const symbols = rowsRef.current.map((row) => row.normalizedSymbol);
    if (!symbols.length) return;
    pollingRef.current = true;
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: Quote[] };
      mergeQuotes(payload.data ?? []);
    } finally {
      pollingRef.current = false;
    }
  }, [mergeQuotes]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchQuotes();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [fetchQuotes]);

  async function saveHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow) {
      setMessage("请先在股票页添加自选股，再来记录持仓。");
      return;
    }

    const parsedCostPrice = Number(costPrice);
    const parsedShares = Number(shares);
    if (!Number.isFinite(parsedCostPrice) || !Number.isFinite(parsedShares)) {
      setMessage("成本价和股票数需要填写数字。");
      return;
    }
    if (parsedCostPrice <= 0 || parsedShares <= 0) {
      setMessage("成本价和股票数必须大于 0。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/watchlist/${selectedRow.id}/holding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice: parsedCostPrice, shares: parsedShares }),
      });
      const payload = (await response.json()) as {
        watchlist?: WatchlistRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "持仓保存失败，请稍后重试。");
        return;
      }
      setRows(payload.watchlist ?? []);
      setMessage(`${hasStockHolding(selectedRow) ? "已更新" : "已保存"} ${selectedRow.name} 的持仓。`);
    } finally {
      setLoading(false);
    }
  }

  async function clearHolding(row = selectedRow) {
    if (!row) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/watchlist/${row.id}/holding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice: null, shares: null }),
      });
      const payload = (await response.json()) as {
        watchlist?: WatchlistRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "清空持仓失败，请稍后重试。");
        return;
      }
      setRows(payload.watchlist ?? []);
      if (row.id === selectedId) {
        setCostPrice("");
        setShares("");
      }
      setMessage(`已删除 ${row.name} 的持仓记录。`);
    } finally {
      setLoading(false);
    }
  }

  function chooseRow(id: string) {
    const row = rows.find((item) => item.id === id);
    setSelectedId(id);
    setCostPrice(inputValue(row?.costPrice));
    setShares(inputValue(row?.shares));
  }

  function editHolding(row: WatchlistRow) {
    setSelectedId(row.id);
    setCostPrice(inputValue(row.costPrice));
    setShares(inputValue(row.shares));
    setMessage(`正在修改 ${row.name} 的持仓。`);
  }

  return (
    <section className="relative rounded-lg border border-line bg-white/85 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">持仓盈亏</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
        <Badge tone="blue">{holdingRows.length} 只已录入</Badge>
      </div>

      <form onSubmit={saveHolding} className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(140px,0.6fr)_minmax(140px,0.6fr)_auto_auto]">
        <Select
          value={selectedId}
          onChange={(event) => chooseRow(event.target.value)}
          aria-label="选择自选股"
        >
          {rows.length ? null : <option value="">暂无自选股</option>}
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.normalizedSymbol}
            </option>
          ))}
        </Select>
        <Input
          value={costPrice}
          onChange={(event) => setCostPrice(event.target.value)}
          inputMode="decimal"
          placeholder="平均成本价"
          aria-label="平均成本价"
        />
        <Input
          value={shares}
          onChange={(event) => setShares(event.target.value)}
          inputMode="decimal"
          placeholder="股票数"
          aria-label="股票数"
        />
        <Button type="submit" disabled={loading || !selectedRow}>
          <Save className="h-4 w-4" />
          保存
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || !selectedRow || !hasStockHolding(selectedRow)}
          onClick={() => clearHolding()}
        >
          <Eraser className="h-4 w-4" />
          清空
        </Button>
      </form>

      {holdingRows.length === 0 ? (
        <div className="p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-moss">
            <BriefcaseBusiness className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">还没有持仓记录</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            先在股票页添加自选股，再回来录入平均成本价和股票数，我会按当前行情自动计算浮动盈亏。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-surface/80 text-xs uppercase tracking-normal text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">代码</th>
                <th className="px-4 py-3 font-medium">市场</th>
                <th className="px-4 py-3 font-medium">成本价</th>
                <th className="px-4 py-3 font-medium">股票数</th>
                <th className="px-4 py-3 font-medium">现价</th>
                <th className="px-4 py-3 font-medium">持仓成本</th>
                <th className="px-4 py-3 font-medium">当前市值</th>
                <th className="px-4 py-3 font-medium">浮动盈亏</th>
                <th className="px-4 py-3 font-medium">盈亏比例</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {holdingRows.map((row) => {
                const metrics = calculateStockHolding(row);
                return (
                  <tr key={row.id} className="border-t border-line/70 hover:bg-moss/5">
                    <td className="px-4 py-4">
                      <div className="font-medium text-ink">{row.name}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted">{row.normalizedSymbol}</td>
                    <td className="px-4 py-4">
                      <Badge tone="blue">{cnMarketName(row.market)}</Badge>
                    </td>
                    <td className="px-4 py-4 text-ink">
                      {formatCurrency(row.costPrice ?? 0, row.currency)}
                    </td>
                    <td className="px-4 py-4 text-ink">{row.shares}</td>
                    <td className="px-4 py-4 font-medium text-ink">
                      {row.quote ? formatCurrency(row.quote.price, row.quote.currency) : "等待行情"}
                    </td>
                    <td className="px-4 py-4 text-ink">
                      {metrics ? formatCurrency(metrics.costValue, metrics.currency) : "等待行情"}
                    </td>
                    <td className="px-4 py-4 text-ink">
                      {metrics ? formatCurrency(metrics.marketValue, metrics.currency) : "等待行情"}
                    </td>
                    <td className={cn("px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnl))}>
                      {metrics ? signedCurrency(metrics.unrealizedPnl, metrics.currency) : "等待行情"}
                    </td>
                    <td className={cn("px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnlPercent))}>
                      {metrics ? formatPercent(metrics.unrealizedPnlPercent) : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="修改持仓"
                          onClick={() => editHolding(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="删除持仓"
                          onClick={() => clearHolding(row)}
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
    </section>
  );
}
