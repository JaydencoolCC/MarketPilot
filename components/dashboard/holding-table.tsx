"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BriefcaseBusiness, Eraser, Info, Pencil, Save, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/i18n/locale-provider";
import type { FundRow, FundSearchResult, FundSnapshot, Quote, Security, WatchlistRow } from "@/lib/domain/types";
import { calculateStockHolding, hasStockHolding } from "@/lib/domain/holdings";
import { fundDetailUrl, stockDetailUrl } from "@/lib/domain/xueqiu";
import { formatCurrency, formatPercent, formatUnitPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { localizedApiMessage } from "@/lib/i18n";

type HoldingTableProps = {
  initialRows: WatchlistRow[];
  initialFundRows: FundRow[];
};

const QUOTE_POLL_INTERVAL_MS = 3000;
const FUND_POLL_INTERVAL_MS = 30000;
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

function fundOptionLabel(row: FundRow | FundSearchResult) {
  return `${row.name} · ${row.normalizedSymbol}`;
}

function hasFundHolding(row: Pick<FundRow, "costPrice" | "shares">) {
  return row.costPrice !== undefined && Number(row.shares) > 0;
}

function calculateFundHolding(row: FundRow) {
  if (!usableFundSnapshot(row.snapshot) || !hasFundHolding(row)) return null;

  const snapshot = usableFundSnapshot(row.snapshot)!;
  const currentPrice = snapshot.estimateValue ?? snapshot.netValue;
  const costValue = row.costPrice! * row.shares!;
  const marketValue = currentPrice * row.shares!;
  const previousPrice = snapshot.changePercent === -100
    ? currentPrice
    : currentPrice / (1 + snapshot.changePercent / 100);
  const todayPnl = (currentPrice - previousPrice) * row.shares!;
  const unrealizedPnl = marketValue - costValue;
  const costBasis = Math.abs(costValue);

  return {
    costValue,
    marketValue,
    todayPnl,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis === 0 ? null : (unrealizedPnl / costBasis) * 100,
    currentPrice,
    currency: snapshot.currency,
  };
}

function fundCurrentPrice(row: Pick<FundRow, "snapshot">) {
  const snapshot = usableFundSnapshot(row.snapshot);
  return snapshot?.estimateValue ?? snapshot?.netValue;
}

function usableQuote(quote: Quote | null | undefined) {
  if (!quote || (quote.status === "error" && quote.price <= 0)) return null;
  return quote;
}

function usableFundSnapshot(snapshot: FundSnapshot | null | undefined) {
  if (!snapshot || (snapshot.status === "error" && snapshot.netValue <= 0)) return null;
  return snapshot;
}

function fundMarketValueInputValue(row: FundRow | undefined) {
  const currentPrice = row ? fundCurrentPrice(row) : undefined;
  if (!row?.shares || !currentPrice) return "";
  return String(currentPrice * row.shares);
}

function fundPnlInputValue(row: FundRow | undefined) {
  const currentPrice = row ? fundCurrentPrice(row) : undefined;
  if (row?.costPrice === undefined || !row.shares || !currentPrice) return "";
  return String((currentPrice - row.costPrice) * row.shares);
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

export function HoldingTable({ initialRows, initialFundRows }: HoldingTableProps) {
  const { locale, t } = useLocale();
  const [activeAsset, setActiveAsset] = useState<"stocks" | "funds">("stocks");
  const [rows, setRows] = useState(initialRows);
  const [selectedId, setSelectedId] = useState(initialRows[0]?.id ?? "");
  const [stockQuery, setStockQuery] = useState(initialRows[0] ? holdingOptionLabel(initialRows[0]) : "");
  const [securitySuggestions, setSecuritySuggestions] = useState<Security[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
  const [isStockSearchOpen, setIsStockSearchOpen] = useState(false);
  const [costPrice, setCostPrice] = useState(inputValue(initialRows[0]?.costPrice));
  const [shares, setShares] = useState(inputValue(initialRows[0]?.shares));
  const [fundRows, setFundRows] = useState(initialFundRows);
  const [selectedFundId, setSelectedFundId] = useState(initialFundRows[0]?.id ?? "");
  const [fundQuery, setFundQuery] = useState(initialFundRows[0] ? fundOptionLabel(initialFundRows[0]) : "");
  const [fundSuggestions, setFundSuggestions] = useState<FundSearchResult[]>([]);
  const [selectedFund, setSelectedFund] = useState<FundSearchResult | null>(null);
  const [isFundSearchOpen, setIsFundSearchOpen] = useState(false);
  const [fundMarketValue, setFundMarketValue] = useState(fundMarketValueInputValue(initialFundRows[0]));
  const [fundPnl, setFundPnl] = useState(fundPnlInputValue(initialFundRows[0]));
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState(t.holdings.stockInitial);
  const [fundMessage, setFundMessage] = useState(t.holdings.fundInitial);
  const [lockPassword, setLockPassword] = useState<string | null>(null);
  const [lockInput, setLockInput] = useState("");
  const [lockConfirmInput, setLockConfirmInput] = useState("");
  const [lockMessage, setLockMessage] = useState(t.holdings.lock.enterPassword);
  const [isLocked, setIsLocked] = useState(true);
  const [lockReady, setLockReady] = useState(false);
  const pollingRef = useRef(false);
  const fundPollingRef = useRef(false);
  const rowsRef = useRef(initialRows);
  const fundRowsRef = useRef(initialFundRows);
  const lockTimerRef = useRef<number | null>(null);
  const lockRootRef = useRef<HTMLElement | null>(null);
  const searchRequestRef = useRef(0);
  const fundSearchRequestRef = useRef(0);
  const isSettingPassword = lockReady && !lockPassword;

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const selectedFundRow = useMemo(
    () => fundRows.find((row) => row.id === selectedFundId) ?? null,
    [fundRows, selectedFundId],
  );
  const holdingRows = useMemo(() => rows.filter(hasStockHolding), [rows]);
  const fundHoldingRows = useMemo(() => fundRows.filter(hasFundHolding), [fundRows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    fundRowsRef.current = fundRows;
  }, [fundRows]);

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
    setLockMessage(t.holdings.lock.locked);
  }, [clearLockTimer, t.holdings.lock.locked]);

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
            ? t.holdings.lock.unlocked
            : t.holdings.lock.enterPassword
          : t.holdings.lock.setup,
      );
    } finally {
      setLockReady(true);
    }
    return clearLockTimer;
  }, [clearLockTimer, t.holdings.lock]);

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
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/securities/search?q=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: Security[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.holdings.stockSearchFailed));
        return;
      }
      if (requestId !== searchRequestRef.current) return;
      setSecuritySuggestions(payload.data ?? []);
      if (!payload.data?.length) {
        setMessage(t.holdings.stockNoMatch);
      }
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false);
    }
  }, [locale, t.holdings.stockNoMatch, t.holdings.stockSearchFailed]);

  const searchFunds = useCallback(async (value: string) => {
    const requestId = fundSearchRequestRef.current + 1;
    fundSearchRequestRef.current = requestId;
    setFundQuery(value);
    setSelectedFundId("");
    setSelectedFund(null);
    setIsFundSearchOpen(true);
    if (!value.trim()) {
      setFundSuggestions([]);
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
        setFundMessage(localizedApiMessage(locale, payload.error?.message, t.holdings.fundSearchFailed));
        return;
      }
      if (requestId !== fundSearchRequestRef.current) return;
      setFundSuggestions(payload.data ?? []);
      if (!payload.data?.length) {
        setFundMessage(t.holdings.fundNoMatch);
      }
    } finally {
      if (requestId === fundSearchRequestRef.current) setSearching(false);
    }
  }, [locale, t.holdings.fundNoMatch, t.holdings.fundSearchFailed]);

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

  const mergeFundSnapshots = useCallback((snapshots: FundSnapshot[]) => {
    const snapshotBySymbol = new Map(snapshots.map((snapshot) => [snapshot.symbol, snapshot]));
    setFundRows((current) =>
      current.map((row) => {
        const snapshot = snapshotBySymbol.get(row.normalizedSymbol);
        if (!snapshot) return row;
        return { ...row, snapshot, dataStatus: snapshot.status };
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

  const fetchFundSnapshots = useCallback(async () => {
    if (isLocked) return;
    if (fundPollingRef.current) return;
    const symbols = fundRowsRef.current.map((row) => row.normalizedSymbol);
    if (!symbols.length) return;
    fundPollingRef.current = true;
    try {
      const response = await fetch(`/api/funds/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: FundSnapshot[] };
      mergeFundSnapshots(payload.data ?? []);
    } finally {
      fundPollingRef.current = false;
    }
  }, [isLocked, mergeFundSnapshots]);

  useEffect(() => {
    if (isLocked) return undefined;
    void fetchFundSnapshots();
    const interval = window.setInterval(() => {
      void fetchFundSnapshots();
    }, FUND_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchFundSnapshots, isLocked]);

  function submitLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = lockInput.trim();
    if (isSettingPassword) {
      if (password.length < 4) {
        setLockMessage(t.holdings.lock.minLength);
        return;
      }
      if (password !== lockConfirmInput.trim()) {
        setLockMessage(t.holdings.lock.mismatch);
        return;
      }
      const saved = safeLocalSet(HOLDING_LOCK_PASSWORD_KEY, password);
      safeSessionSet(HOLDING_LOCK_SESSION_KEY, "true");
      safeSessionSet(HOLDING_LOCK_LAST_ACTIVITY_KEY, String(Date.now()));
      setLockPassword(password);
      setLockInput("");
      setLockConfirmInput("");
      setLockMessage(saved ? t.holdings.lock.unlocked : t.holdings.lock.temporaryUnlock);
      setIsLocked(false);
      resetLockTimer();
      return;
    }

    if (!lockPassword || password !== lockPassword) {
      setLockMessage(t.holdings.lock.wrong);
      return;
    }
    setLockInput("");
    safeSessionSet(HOLDING_LOCK_SESSION_KEY, "true");
    safeSessionSet(HOLDING_LOCK_LAST_ACTIVITY_KEY, String(Date.now()));
    setLockMessage(t.holdings.lock.unlocked);
    setIsLocked(false);
    resetLockTimer();
  }

  async function saveHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow && !selectedSecurity) {
      setMessage(t.holdings.saveStockRequiresPick);
      return;
    }

    const parsedCostPrice = Number(costPrice);
    const parsedShares = Number(shares);
    if (!Number.isFinite(parsedCostPrice) || !Number.isFinite(parsedShares)) {
      setMessage(t.holdings.stockNumbersInvalid);
      return;
    }
    if (parsedCostPrice <= 0 || parsedShares <= 0) {
      setMessage(t.holdings.stockNumbersPositive);
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
          setMessage(localizedApiMessage(locale, addPayload.error?.message, t.holdings.addStockFailed));
          return;
        }
        rowForHolding = addPayload.data;
        setRows(addPayload.watchlist ?? []);
        setSelectedId(rowForHolding.id);
      }

      if (!rowForHolding) {
        setMessage(t.holdings.saveStockRequiresPick);
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
        setMessage(localizedApiMessage(locale, payload.error?.message, t.holdings.stockSaveFailed));
        return;
      }
      setRows(payload.watchlist ?? []);
      setSelectedId(rowForHolding.id);
      setSelectedSecurity(null);
      setStockQuery(holdingOptionLabel(rowForHolding));
      setSecuritySuggestions([]);
      setIsStockSearchOpen(false);
      setMessage(t.holdings.stockSaved(hasStockHolding(rowForHolding), rowForHolding.name));
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
        setMessage(localizedApiMessage(locale, payload.error?.message, t.holdings.clearStockFailed));
        return;
      }
      setRows(payload.watchlist ?? []);
      if (row.id === selectedId) {
        setCostPrice("");
        setShares("");
      }
      setMessage(t.holdings.stockCleared(row.name));
    } finally {
      setLoading(false);
    }
  }

  async function saveFundHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFundRow && !selectedFund) {
      setFundMessage(t.holdings.saveFundRequiresPick);
      return;
    }

    const parsedMarketValue = Number(fundMarketValue);
    const parsedPnl = Number(fundPnl);
    if (!Number.isFinite(parsedMarketValue) || !Number.isFinite(parsedPnl)) {
      setFundMessage(t.holdings.fundNumbersInvalid);
      return;
    }
    if (parsedMarketValue <= 0) {
      setFundMessage(t.holdings.fundMarketValuePositive);
      return;
    }

    setLoading(true);
    try {
      let rowForHolding = selectedFundRow;
      if (!rowForHolding && selectedFund) {
        const addResponse = await fetch("/api/funds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: selectedFund.normalizedSymbol,
            type: selectedFund.type,
            name: selectedFund.name,
          }),
        });
        const addPayload = (await addResponse.json()) as {
          data?: FundRow;
          funds?: FundRow[];
          error?: { message: string };
        };
        if (!addResponse.ok || !addPayload.data) {
          setFundMessage(localizedApiMessage(locale, addPayload.error?.message, t.holdings.addFundFailed));
          return;
        }
        rowForHolding = addPayload.data;
        setFundRows(addPayload.funds ?? []);
        setSelectedFundId(rowForHolding.id);
      }

      if (!rowForHolding) {
        setFundMessage(t.holdings.saveFundRequiresPick);
        return;
      }

      const currentPrice = fundCurrentPrice(rowForHolding);
      if (!currentPrice || currentPrice <= 0) {
        setFundMessage(t.holdings.fundNoValue);
        return;
      }
      const parsedShares = parsedMarketValue / currentPrice;
      const parsedCostValue = parsedMarketValue - parsedPnl;
      if (parsedCostValue <= 0) {
        setFundMessage(t.holdings.fundCostPositive);
        return;
      }
      const parsedCostPrice = parsedCostValue / parsedShares;

      const response = await fetch(`/api/funds/${rowForHolding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice: parsedCostPrice, shares: parsedShares }),
      });
      const payload = (await response.json()) as {
        funds?: FundRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setFundMessage(localizedApiMessage(locale, payload.error?.message, t.holdings.fundSaveFailed));
        return;
      }
      setFundRows(payload.funds ?? []);
      setSelectedFundId(rowForHolding.id);
      setSelectedFund(null);
      setFundQuery(fundOptionLabel(rowForHolding));
      setFundSuggestions([]);
      setIsFundSearchOpen(false);
      setFundMessage(t.holdings.fundSaved(hasFundHolding(rowForHolding), rowForHolding.name));
    } finally {
      setLoading(false);
    }
  }

  async function clearFundHolding(row = selectedFundRow) {
    if (!row) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/funds/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice: null, shares: null }),
      });
      const payload = (await response.json()) as {
        funds?: FundRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setFundMessage(localizedApiMessage(locale, payload.error?.message, t.holdings.clearFundFailed));
        return;
      }
      setFundRows(payload.funds ?? []);
      if (row.id === selectedFundId) {
        setFundMarketValue("");
        setFundPnl("");
      }
      setFundMessage(t.holdings.fundCleared(row.name));
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

  function chooseFundRow(id: string) {
    const row = fundRows.find((item) => item.id === id);
    setSelectedFundId(id);
    setSelectedFund(null);
    setFundQuery(row ? fundOptionLabel(row) : "");
    setFundSuggestions([]);
    setIsFundSearchOpen(false);
    setFundMarketValue(fundMarketValueInputValue(row));
    setFundPnl(fundPnlInputValue(row));
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
    setMessage(t.holdings.stockSelected(security.name));
  }

  function chooseFund(fund: FundSearchResult) {
    const existingRow = fundRows.find((row) => row.normalizedSymbol === fund.normalizedSymbol);
    if (existingRow) {
      chooseFundRow(existingRow.id);
      return;
    }
    setSelectedFundId("");
    setSelectedFund(fund);
    setFundQuery(fundOptionLabel(fund));
    setFundSuggestions([]);
    setIsFundSearchOpen(false);
    setFundMarketValue("");
    setFundPnl("");
    setFundMessage(t.holdings.fundSelected(fund.name));
  }

  function editHolding(row: WatchlistRow) {
    setSelectedId(row.id);
    setSelectedSecurity(null);
    setStockQuery(holdingOptionLabel(row));
    setSecuritySuggestions([]);
    setIsStockSearchOpen(false);
    setCostPrice(inputValue(row.costPrice));
    setShares(inputValue(row.shares));
    setMessage(t.holdings.stockEditing(row.name));
  }

  function editFundHolding(row: FundRow) {
    setSelectedFundId(row.id);
    setSelectedFund(null);
    setFundQuery(fundOptionLabel(row));
    setFundSuggestions([]);
    setIsFundSearchOpen(false);
    setFundMarketValue(fundMarketValueInputValue(row));
    setFundPnl(fundPnlInputValue(row));
    setFundMessage(t.holdings.fundEditing(row.name));
  }

  const lockTitle = isSettingPassword ? t.holdings.lock.setupTitle : t.holdings.lock.lockedTitle;
  const lockButtonText = isSettingPassword ? t.holdings.lock.setupButton : t.holdings.lock.unlockButton;

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
              <h3 className="text-base font-semibold text-ink">{lockReady ? lockTitle : t.holdings.lock.lockedTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {lockReady ? lockMessage : t.holdings.lock.preparing}
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <Input
                type="password"
                value={lockInput}
                onChange={(event) => setLockInput(event.target.value)}
                placeholder={isSettingPassword ? t.holdings.lock.setPassword : t.holdings.lock.inputPassword}
                aria-label={isSettingPassword ? t.holdings.lock.setPasswordAria : t.holdings.lock.inputPasswordAria}
                autoFocus
              />
              {isSettingPassword ? (
                <Input
                  type="password"
                  value={lockConfirmInput}
                  onChange={(event) => setLockConfirmInput(event.target.value)}
                  placeholder={t.holdings.lock.confirmPassword}
                  aria-label={t.holdings.lock.confirmPasswordAria}
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
            <h2 className="text-lg font-semibold text-ink">{t.holdings.title}</h2>
            <p className="mt-1 text-sm text-muted">{activeAsset === "stocks" ? message : fundMessage}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["stocks", "funds"] as const).map((item) => (
              <Button
                key={item}
                variant={activeAsset === item ? "primary" : "secondary"}
                size="sm"
                onClick={() => setActiveAsset(item)}
              >
                {item === "stocks" ? t.holdings.stockTab : t.holdings.fundTab}
              </Button>
            ))}
            <Badge tone="blue">
              {activeAsset === "stocks" ? t.holdings.recordedCount(holdingRows.length) : t.holdings.recordedCount(fundHoldingRows.length)}
            </Badge>
          </div>
        </div>

        {activeAsset === "stocks" ? (
          <>
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
                  placeholder={t.holdings.stockSearchPlaceholder}
                  aria-label={t.stockTable.searchAria}
                  className="pl-9"
                  autoComplete="off"
                />
                {isStockSearchOpen ? (
                  <div className="absolute left-0 right-0 top-12 z-20 max-h-72 overflow-y-auto rounded-lg border border-line bg-white shadow-soft">
                    {!stockQuery.trim() ? (
                      <div className="px-4 py-3 text-sm text-muted">{t.holdings.stockStartSearch}</div>
                    ) : searching ? (
                      <div className="px-4 py-3 text-sm text-muted">{t.common.searching}...</div>
                    ) : securitySuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted">{t.holdings.noStocks}</div>
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
                              {alreadyInWatchlist ? <Badge tone="green">{t.holdings.alreadyWatchlist}</Badge> : null}
                              <Badge tone="blue">{t.common.markets[security.market]}</Badge>
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
                placeholder={t.holdings.averageCost}
                aria-label={t.holdings.averageCost}
              />
              <Input
                value={shares}
                onChange={(event) => setShares(event.target.value)}
                inputMode="decimal"
                placeholder={t.holdings.shares}
                aria-label={t.holdings.shares}
              />
              <Button type="submit" disabled={loading || searching || (!selectedRow && !selectedSecurity)}>
                <Save className="h-4 w-4" />
                {t.common.save}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={loading || !selectedRow || !hasStockHolding(selectedRow)}
                onClick={() => clearHolding()}
              >
                <Eraser className="h-4 w-4" />
                {t.common.clear}
              </Button>
            </form>

            {holdingRows.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-moss">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">{t.holdings.emptyStockTitle}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                  {t.holdings.emptyStockBody}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1480px] border-collapse text-left text-sm">
                <thead className="whitespace-nowrap bg-surface/80 text-xs uppercase tracking-normal text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t.common.name}</th>
                    <th className="px-4 py-3 font-medium">{t.common.symbol}</th>
                    <th className="px-4 py-3 font-medium">{t.common.market}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.costPrice}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.shares}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.currentPrice}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.costValue}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.marketValue}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.todayPnl}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.unrealizedPnl}</th>
                    <th className="px-4 py-3 font-medium">{t.holdings.columns.unrealizedPnlPercent}</th>
                    <th className="px-4 py-3 text-right font-medium">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingRows.map((row) => {
                    const quote = usableQuote(row.quote);
                    const metrics = calculateStockHolding({ ...row, quote });
                    return (
                      <tr key={row.id} className="border-t border-line/70 hover:bg-moss/5">
                        <td className="px-4 py-4">
                          <div className="font-medium text-ink">{row.name}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-muted">{row.normalizedSymbol}</td>
                        <td className="px-4 py-4">
                          <Badge tone="blue">{t.common.markets[row.market]}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-ink">
                          {formatUnitPrice(row.costPrice ?? 0, row.currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-ink">{row.shares}</td>
                        <td className="whitespace-nowrap px-4 py-4 font-medium text-ink">
                          {quote ? formatUnitPrice(quote.price, quote.currency) : t.common.waitQuote}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-ink">
                          {metrics ? formatCurrency(metrics.costValue, metrics.currency) : t.common.waitQuote}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-ink">
                          {metrics ? formatCurrency(metrics.marketValue, metrics.currency) : t.common.waitQuote}
                        </td>
                        <td className={cn("whitespace-nowrap px-4 py-4 font-semibold", pnlColorClass(metrics?.todayPnl))}>
                          {metrics ? signedCurrency(metrics.todayPnl, metrics.currency) : t.common.waitQuote}
                        </td>
                        <td className={cn("whitespace-nowrap px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnl))}>
                          {metrics ? signedCurrency(metrics.unrealizedPnl, metrics.currency) : t.common.waitQuote}
                        </td>
                        <td className={cn("whitespace-nowrap px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnlPercent ?? undefined))}>
                          {metrics?.unrealizedPnlPercent === null || metrics === null
                            ? "-"
                            : formatPercent(metrics.unrealizedPnlPercent)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-1">
                            <a
                              href={stockDetailUrl(row.normalizedSymbol)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t.common.details}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                            >
                              <Info className="h-4 w-4" />
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t.holdings.editHoldingAria}
                              onClick={() => editHolding(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t.holdings.deleteHoldingAria}
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
          </>
        ) : (
          <>
            <form onSubmit={saveFundHolding} className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(140px,0.6fr)_minmax(140px,0.6fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
                <Input
                  value={fundQuery}
                  onChange={(event) => void searchFunds(event.target.value)}
                  onFocus={() => setIsFundSearchOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsFundSearchOpen(false), 120);
                  }}
                  placeholder={t.holdings.fundSearchPlaceholder}
                  aria-label={t.fundTable.searchAria}
                  className="pl-9"
                  autoComplete="off"
                />
                {isFundSearchOpen ? (
                  <div className="absolute left-0 right-0 top-12 z-20 max-h-72 overflow-y-auto rounded-lg border border-line bg-white shadow-soft">
                    {!fundQuery.trim() ? (
                      <div className="px-4 py-3 text-sm text-muted">{t.holdings.fundStartSearch}</div>
                    ) : searching ? (
                      <div className="px-4 py-3 text-sm text-muted">{t.common.searching}...</div>
                    ) : fundSuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted">{t.holdings.noFunds}</div>
                    ) : (
                      fundSuggestions.map((fund) => {
                        const alreadyInFunds = fundRows.some(
                          (row) => row.normalizedSymbol === fund.normalizedSymbol,
                        );
                        return (
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
                              <span className="mt-1 block font-mono text-xs text-muted">{fund.normalizedSymbol}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              {alreadyInFunds ? <Badge tone="green">{t.holdings.alreadyWatchlist}</Badge> : null}
                              <Badge tone="blue">{t.common.fundType[fund.type]}</Badge>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
              <Input
                value={fundMarketValue}
                onChange={(event) => setFundMarketValue(event.target.value)}
                inputMode="decimal"
                placeholder={t.holdings.marketValue}
                aria-label={t.holdings.marketValue}
              />
              <Input
                value={fundPnl}
                onChange={(event) => setFundPnl(event.target.value)}
                inputMode="decimal"
                placeholder={t.holdings.holdingPnl}
                aria-label={t.holdings.holdingPnl}
              />
              <Button type="submit" disabled={loading || searching || (!selectedFundRow && !selectedFund)}>
                <Save className="h-4 w-4" />
                {t.common.save}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={loading || !selectedFundRow || !hasFundHolding(selectedFundRow)}
                onClick={() => clearFundHolding()}
              >
                <Eraser className="h-4 w-4" />
                {t.common.clear}
              </Button>
            </form>

            {fundHoldingRows.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-moss">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">{t.holdings.emptyFundTitle}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                  {t.holdings.emptyFundBody}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1480px] border-collapse text-left text-sm">
                  <thead className="whitespace-nowrap bg-surface/80 text-xs uppercase tracking-normal text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t.common.name}</th>
                      <th className="px-4 py-3 font-medium">{t.common.symbol}</th>
                      <th className="px-4 py-3 font-medium">{t.common.type}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.costNetValue}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.fundShares}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.currentValue}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.costValue}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.marketValue}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.todayPnl}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.unrealizedPnl}</th>
                      <th className="px-4 py-3 font-medium">{t.holdings.columns.unrealizedPnlPercent}</th>
                      <th className="px-4 py-3 text-right font-medium">{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundHoldingRows.map((row) => {
                      const metrics = calculateFundHolding(row);
                      return (
                        <tr key={row.id} className="border-t border-line/70 hover:bg-moss/5">
                          <td className="px-4 py-4">
                            <div className="font-medium text-ink">{row.name}</div>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs text-muted">{row.normalizedSymbol}</td>
                          <td className="px-4 py-4">
                            <Badge tone="blue">{t.common.fundType[row.type]}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-ink">
                            {formatUnitPrice(row.costPrice ?? 0, row.currency)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-ink">{row.shares}</td>
                          <td className="whitespace-nowrap px-4 py-4 font-medium text-ink">
                            {metrics ? formatUnitPrice(metrics.currentPrice, metrics.currency) : t.common.waitValue}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-ink">
                            {metrics ? formatCurrency(metrics.costValue, metrics.currency) : t.common.waitValue}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-ink">
                            {metrics ? formatCurrency(metrics.marketValue, metrics.currency) : t.common.waitValue}
                          </td>
                          <td className={cn("whitespace-nowrap px-4 py-4 font-semibold", pnlColorClass(metrics?.todayPnl))}>
                            {metrics ? signedCurrency(metrics.todayPnl, metrics.currency) : t.common.waitValue}
                          </td>
                          <td className={cn("whitespace-nowrap px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnl))}>
                            {metrics ? signedCurrency(metrics.unrealizedPnl, metrics.currency) : t.common.waitValue}
                          </td>
                          <td className={cn("whitespace-nowrap px-4 py-4 font-semibold", pnlColorClass(metrics?.unrealizedPnlPercent ?? undefined))}>
                            {metrics?.unrealizedPnlPercent === null || metrics === null
                              ? "-"
                              : formatPercent(metrics.unrealizedPnlPercent)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-1">
                              <a
                                href={fundDetailUrl(row.normalizedSymbol)}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t.common.details}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                              >
                                <Info className="h-4 w-4" />
                              </a>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t.holdings.editFundHoldingAria}
                                onClick={() => editFundHolding(row)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t.holdings.deleteFundHoldingAria}
                                onClick={() => clearFundHolding(row)}
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
          </>
        )}
      </div>
      ) : null}
    </section>
  );
}
