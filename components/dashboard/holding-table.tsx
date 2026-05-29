"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BriefcaseBusiness, Eraser, Info, Pencil, Save, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Quote, Security, WatchlistRow } from "@/lib/domain/types";
import { calculateStockHolding, hasStockHolding } from "@/lib/domain/holdings";
import { xueqiuStockUrl } from "@/lib/domain/xueqiu";
import { cnMarketName, formatCurrency, formatPercent, formatUnitPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type HoldingTableProps = {
  initialRows: WatchlistRow[];
};

const QUOTE_POLL_INTERVAL_MS = 3000;
const HOLDING_LOCK_PASSWORD_KEY = "marketpilot-holding-password";
const HOLDING_LOCK_SESSION_KEY = "marketpilot-holding-unlocked";
const HOLDING_LOCK_LAST_ACTIVITY_KEY = "marketpilot-holding-last-activity";
const HOLDING_LOCK_TIMEOUT_MS = 3 * 60 * 1000;

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
  return value === undefined ? "" : String(value);
}

function holdingOptionLabel(row: WatchlistRow | Security) {
  return `${row.name} · ${row.normalizedSymbol}`;
}

function safeLocalGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeSessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Browser storage can be blocked; the page lock still works in memory.
  }
}

function safeSessionRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Browser storage can be blocked; in-memory state still controls the current view.
  }
}

export function HoldingTable({ initialRows }: HoldingTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [selectedId, setSelectedId] = useState(initialRows[0]?.id ?? "");
  const [stockQuery, setStockQuery] = useState(initialRows[0] ? holdingOptionLabel(initialRows[0]) : "");
  const [securitySuggestions, setSecuritySuggestions] = useState<Security[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
  const [isStockSearchOpen, setIsStockSearchOpen] = useState(false);
  const [costPrice, setCostPrice] = useState(inputValue(initialRows[0]?.costPrice));
  const [shares, setShares] = useState(inputValue(initialRows[0]?.shares));
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("搜索一只股票，录入平均成本价和股票数。");
  const [lockPassword, setLockPassword] = useState<string | null>(null);
  const [lockInput, setLockInput] = useState("");
  const [lockConfirmInput, setLockConfirmInput] = useState("");
  const [lockMessage, setLockMessage] = useState("请输入持仓页密码。");
  const [isLocked, setIsLocked] = useState(true);
  const [lockReady, setLockReady] = useState(false);
  const pollingRef = useRef(false);
  const rowsRef = useRef(initialRows);
  const lockTimerRef = useRef<number | null>(null);
  const lockRootRef = useRef<HTMLElement | null>(null);
  const searchRequestRef = useRef(0);
  const isSettingPassword = lockReady && !lockPassword;

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const holdingRows = useMemo(() => rows.filter(hasStockHolding), [rows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current === null) return;
    window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = null;
  }, []);

  const lockHoldings = useCallback(() => {
    clearLockTimer();
    safeSessionRemove(HOLDING_LOCK_SESSION_KEY);
    safeSessionRemove(HOLDING_LOCK_LAST_ACTIVITY_KEY);
    setIsLocked(true);
    setLockInput("");
    setLockConfirmInput("");
    setLockMessage("持仓页已锁定，请输入密码。");
  }, [clearLockTimer]);

  const resetLockTimer = useCallback(() => {
    clearLockTimer();
    safeSessionSet(HOLDING_LOCK_SESSION_KEY, "true");
    safeSessionSet(HOLDING_LOCK_LAST_ACTIVITY_KEY, String(Date.now()));
    lockTimerRef.current = window.setTimeout(lockHoldings, HOLDING_LOCK_TIMEOUT_MS);
  }, [clearLockTimer, lockHoldings]);

  useEffect(() => {
    try {
      const savedPassword = safeLocalGet(HOLDING_LOCK_PASSWORD_KEY);
      const isSessionUnlocked = safeSessionGet(HOLDING_LOCK_SESSION_KEY) === "true";
      const lastActivity = Number(safeSessionGet(HOLDING_LOCK_LAST_ACTIVITY_KEY) ?? 0);
      const isSessionActive = isSessionUnlocked && Date.now() - lastActivity < HOLDING_LOCK_TIMEOUT_MS;
      setLockPassword(savedPassword);
      setIsLocked(savedPassword ? !isSessionActive : true);
      setLockMessage(
        savedPassword
          ? isSessionActive
            ? "已解锁持仓页。"
            : "请输入持仓页密码。"
          : "首次使用前，请设置持仓页密码。",
      );
    } finally {
      setLockReady(true);
    }
    return clearLockTimer;
  }, [clearLockTimer]);

  useEffect(() => {
    if (!lockReady || isLocked) return undefined;

    resetLockTimer();
    const lockRoot = lockRootRef.current;
    if (!lockRoot) return clearLockTimer;
    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => {
      lockRoot.addEventListener(eventName, resetLockTimer, { passive: true });
    });
    return () => {
      activityEvents.forEach((eventName) => {
        lockRoot.removeEventListener(eventName, resetLockTimer);
      });
      clearLockTimer();
    };
  }, [clearLockTimer, isLocked, lockHoldings, lockReady, resetLockTimer]);

  const searchSecurities = useCallback(async (value: string) => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setStockQuery(value);
    setSelectedId("");
    setSelectedSecurity(null);
    setIsStockSearchOpen(true);
    if (!value.trim()) {
      setSecuritySuggestions([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/securities/search?q=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: Security[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "搜索暂时不可用。");
        return;
      }
      if (requestId !== searchRequestRef.current) return;
      setSecuritySuggestions(payload.data ?? []);
      if (!payload.data?.length) {
        setMessage("没有找到匹配证券，可以换成股票代码或公司名再试。");
      }
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false);
    }
  }, []);

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
    if (isLocked) return;
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
  }, [isLocked, mergeQuotes]);

  useEffect(() => {
    if (isLocked) return undefined;
    void fetchQuotes();
    const interval = window.setInterval(() => {
      void fetchQuotes();
    }, QUOTE_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchQuotes, isLocked]);

  function submitLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = lockInput.trim();
    if (isSettingPassword) {
      if (password.length < 4) {
        setLockMessage("密码至少需要 4 位。");
        return;
      }
      if (password !== lockConfirmInput.trim()) {
        setLockMessage("两次输入的密码不一致。");
        return;
      }
      const saved = safeLocalSet(HOLDING_LOCK_PASSWORD_KEY, password);
      safeSessionSet(HOLDING_LOCK_SESSION_KEY, "true");
      safeSessionSet(HOLDING_LOCK_LAST_ACTIVITY_KEY, String(Date.now()));
      setLockPassword(password);
      setLockInput("");
      setLockConfirmInput("");
      setLockMessage(saved ? "已解锁持仓页。" : "浏览器无法保存密码，本次已临时解锁。");
      setIsLocked(false);
      resetLockTimer();
      return;
    }

    if (!lockPassword || password !== lockPassword) {
      setLockMessage("密码不正确，请再试一次。");
      return;
    }
    setLockInput("");
    safeSessionSet(HOLDING_LOCK_SESSION_KEY, "true");
    safeSessionSet(HOLDING_LOCK_LAST_ACTIVITY_KEY, String(Date.now()));
    setLockMessage("已解锁持仓页。");
    setIsLocked(false);
    resetLockTimer();
  }

  async function saveHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow && !selectedSecurity) {
      setMessage("请先搜索并选择一只股票。");
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
      let rowForHolding = selectedRow;
      if (!rowForHolding && selectedSecurity) {
        const addResponse = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: selectedSecurity.normalizedSymbol }),
        });
        const addPayload = (await addResponse.json()) as {
          data?: WatchlistRow;
          watchlist?: WatchlistRow[];
          error?: { message: string };
        };
        if (!addResponse.ok || !addPayload.data) {
          setMessage(addPayload.error?.message ?? "添加股票失败，请稍后重试。");
          return;
        }
        rowForHolding = addPayload.data;
        setRows(addPayload.watchlist ?? []);
        setSelectedId(rowForHolding.id);
      }

      if (!rowForHolding) {
        setMessage("请先搜索并选择一只股票。");
        return;
      }

      const response = await fetch(`/api/watchlist/${rowForHolding.id}/holding`, {
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
      setSelectedId(rowForHolding.id);
      setSelectedSecurity(null);
      setStockQuery(holdingOptionLabel(rowForHolding));
      setSecuritySuggestions([]);
      setIsStockSearchOpen(false);
      setMessage(`${hasStockHolding(rowForHolding) ? "已更新" : "已保存"} ${rowForHolding.name} 的持仓。`);
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
    setSelectedSecurity(null);
    setStockQuery(row ? holdingOptionLabel(row) : "");
    setSecuritySuggestions([]);
    setIsStockSearchOpen(false);
    setCostPrice(inputValue(row?.costPrice));
    setShares(inputValue(row?.shares));
  }

  function chooseSecurity(security: Security) {
    const existingRow = rows.find((row) => row.normalizedSymbol === security.normalizedSymbol);
    if (existingRow) {
      chooseRow(existingRow.id);
      return;
    }
    setSelectedId("");
    setSelectedSecurity(security);
    setStockQuery(holdingOptionLabel(security));
    setSecuritySuggestions([]);
    setIsStockSearchOpen(false);
    setCostPrice("");
    setShares("");
    setMessage(`已选择 ${security.name}，保存持仓时会同步加入自选股。`);
  }

  function editHolding(row: WatchlistRow) {
    setSelectedId(row.id);
    setSelectedSecurity(null);
    setStockQuery(holdingOptionLabel(row));
    setSecuritySuggestions([]);
    setIsStockSearchOpen(false);
    setCostPrice(inputValue(row.costPrice));
    setShares(inputValue(row.shares));
    setMessage(`正在修改 ${row.name} 的持仓。`);
  }

  const lockTitle = isSettingPassword ? "设置持仓页密码" : "持仓页已锁定";
  const lockButtonText = isSettingPassword ? "设置并解锁" : "解锁";

  return (
    <section
      ref={lockRootRef}
      className={cn("relative rounded-lg border border-line bg-white/85 shadow-soft", isLocked && "min-h-[420px]")}
    >
      {isLocked ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-white/95 p-6 backdrop-blur-sm">
          <form
            onSubmit={submitLock}
            className="w-full max-w-sm rounded-lg border border-line bg-white p-5 shadow-soft"
          >
            <div>
              <h3 className="text-base font-semibold text-ink">{lockReady ? lockTitle : "持仓页已锁定"}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {lockReady ? lockMessage : "正在准备持仓页密码锁。"}
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <Input
                type="password"
                value={lockInput}
                onChange={(event) => setLockInput(event.target.value)}
                placeholder={isSettingPassword ? "设置密码" : "输入密码"}
                aria-label={isSettingPassword ? "设置持仓页密码" : "输入持仓页密码"}
                autoFocus
              />
              {isSettingPassword ? (
                <Input
                  type="password"
                  value={lockConfirmInput}
                  onChange={(event) => setLockConfirmInput(event.target.value)}
                  placeholder="再次输入密码"
                  aria-label="再次输入持仓页密码"
                />
              ) : null}
            </div>
            <Button type="submit" className="mt-4 w-full">
              {lockButtonText}
            </Button>
          </form>
        </div>
      ) : null}

      {!isLocked ? (
      <div>
        <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">持仓盈亏</h2>
            <p className="mt-1 text-sm text-muted">{message}</p>
          </div>
          <Badge tone="blue">{holdingRows.length} 只已录入</Badge>
        </div>

        <form onSubmit={saveHolding} className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(140px,0.6fr)_minmax(140px,0.6fr)_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
            <Input
              value={stockQuery}
              onChange={(event) => void searchSecurities(event.target.value)}
              onFocus={() => setIsStockSearchOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setIsStockSearchOpen(false), 120);
              }}
              placeholder="搜索股票代码或公司名，例如 AAPL、腾讯、中国电信"
              aria-label="搜索股票"
              className="pl-9"
              autoComplete="off"
            />
            {isStockSearchOpen ? (
              <div className="absolute left-0 right-0 top-12 z-20 max-h-72 overflow-y-auto rounded-lg border border-line bg-white shadow-soft">
                {!stockQuery.trim() ? (
                  <div className="px-4 py-3 text-sm text-muted">输入股票代码或公司名开始搜索</div>
                ) : searching ? (
                  <div className="px-4 py-3 text-sm text-muted">搜索中...</div>
                ) : securitySuggestions.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted">没有匹配的股票</div>
                ) : (
                  securitySuggestions.map((security) => {
                    const alreadyInWatchlist = rows.some(
                      (row) => row.normalizedSymbol === security.normalizedSymbol,
                    );
                    return (
                      <button
                        key={security.normalizedSymbol}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-left last:border-b-0 hover:bg-moss/5"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          chooseSecurity(security);
                        }}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-ink">{security.name}</span>
                          <span className="mt-1 block text-xs text-muted">{security.normalizedSymbol}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          {alreadyInWatchlist ? <Badge tone="green">已自选</Badge> : null}
                          <Badge tone="blue">{cnMarketName(security.market)}</Badge>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
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
          <Button type="submit" disabled={loading || searching || (!selectedRow && !selectedSecurity)}>
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
                直接搜索股票，录入平均成本价和股票数，我会同步加入自选股并按当前行情自动计算浮动盈亏。
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
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
                    <th className="px-4 py-3 font-medium">今日收益</th>
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
                          {formatUnitPrice(row.costPrice ?? 0, row.currency)}
                        </td>
                        <td className="px-4 py-4 text-ink">{row.shares}</td>
                        <td className="px-4 py-4 font-medium text-ink">
                          {row.quote ? formatUnitPrice(row.quote.price, row.quote.currency) : "等待行情"}
                        </td>
                        <td className="px-4 py-4 text-ink">
                          {metrics ? formatCurrency(metrics.costValue, metrics.currency) : "等待行情"}
                        </td>
                        <td className="px-4 py-4 text-ink">
                          {metrics ? formatCurrency(metrics.marketValue, metrics.currency) : "等待行情"}
                        </td>
                        <td className={cn("px-4 py-4 font-semibold", pnlColorClass(metrics?.todayPnl))}>
                          {metrics ? signedCurrency(metrics.todayPnl, metrics.currency) : "等待行情"}
                        </td>
                        <td className={cn("px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnl))}>
                          {metrics ? signedCurrency(metrics.unrealizedPnl, metrics.currency) : "等待行情"}
                        </td>
                        <td className={cn("px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnlPercent ?? undefined))}>
                          {metrics?.unrealizedPnlPercent === null || metrics === null
                            ? "-"
                            : formatPercent(metrics.unrealizedPnlPercent)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-1">
                            <a
                              href={xueqiuStockUrl(row.normalizedSymbol)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="打开雪球"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                            >
                              <Info className="h-4 w-4" />
                            </a>
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
      </div>
      ) : null}
    </section>
  );
}
