"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";
import type { GoldHistory, GoldRange, GoldScope } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { localizedApiMessage } from "@/lib/i18n";

const scopes: GoldScope[] = ["international", "domestic"];
const ranges: GoldRange[] = ["1d", "1m", "3m", "6m", "1y"];

export function GoldPanel() {
  const { locale, t } = useLocale();
  const [scope, setScope] = useState<GoldScope>("international");
  const [range, setRange] = useState<GoldRange>("3m");
  const [history, setHistory] = useState<GoldHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(t.goldPanel.loading);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      setLoading(true);
      try {
        const response = await fetch(`/api/gold/history?scope=${scope}&range=${range}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { data?: GoldHistory; error?: { message: string } };
        if (!response.ok || !payload.data) {
          setMessage(localizedApiMessage(locale, payload.error?.message, t.goldPanel.unavailable));
          return;
        }
        setHistory(payload.data);
        setMessage(
          payload.data.scope === "domestic"
            ? t.goldPanel.domesticMessage
            : t.goldPanel.internationalMessage,
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage(t.goldPanel.unavailable);
        }
      } finally {
        setLoading(false);
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [locale, range, scope, t.goldPanel]);

  async function reloadHistory() {
    setLoading(true);
    try {
      const response = await fetch(`/api/gold/history?scope=${scope}&range=${range}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: GoldHistory; error?: { message: string } };
      if (!response.ok || !payload.data) {
        setMessage(localizedApiMessage(locale, payload.error?.message, t.goldPanel.unavailable));
        return;
      }
      setHistory(payload.data);
      setMessage(
        payload.data.scope === "domestic"
          ? t.goldPanel.domesticMessage
          : t.goldPanel.internationalMessage,
      );
    } finally {
      setLoading(false);
    }
  }

  const chart = useMemo(() => buildChart(history, t.goldPanel.locale), [history, t.goldPanel.locale]);
  const positive = (history?.changePercent ?? 0) >= 0;

  return (
    <section className="rounded-lg border border-line bg-white/85 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.goldPanel.title}</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
        <Button variant="secondary" size="icon" aria-label={t.goldPanel.refreshAria} onClick={reloadHistory}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {scopes.map((item) => (
            <Button
              key={item}
              variant={scope === item ? "primary" : "secondary"}
              size="sm"
              onClick={() => setScope(item)}
            >
              {t.goldPanel.scopes[item]}
            </Button>
          ))}
          <div className="mx-1 hidden h-8 w-px bg-line md:block" />
          {ranges.map((item) => (
            <Button
              key={item}
              variant={range === item ? "primary" : "secondary"}
              size="sm"
              onClick={() => setRange(item)}
            >
              {t.goldPanel.ranges[item]}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label={t.goldPanel.currentPrice} value={history ? formatCurrency(history.currentPrice, history.currency) : "-"} />
          <Metric
            label={t.goldPanel.rangeChange}
            value={history ? formatPercent(history.changePercent) : "-"}
            className={positive ? "text-coral" : "text-moss"}
          />
          <Metric label={t.goldPanel.unit} value={history ? t.goldPanel.perUnit(history.unit) : "-"} />
          <Metric label={t.common.source} value={history?.provider ?? "-"} />
        </div>

        <div className="rounded-md border border-line bg-surface/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">
                {scope === "domestic" ? t.goldPanel.domesticTitle : t.goldPanel.internationalTitle}
              </div>
              <div className="mt-1 text-xs text-muted">
                {history
                  ? t.goldPanel.points(history.points.length, new Date(history.updatedAt).toLocaleString(t.goldPanel.locale))
                  : t.goldPanel.waitingData}
              </div>
            </div>
            <Badge tone={positive ? "red" : "green"}>{history ? formatPercent(history.changePercent) : "-"}</Badge>
          </div>

          <div className="mt-4 aspect-[16/7] w-full overflow-hidden rounded-md bg-white">
            <svg viewBox="0 0 760 340" role="img" aria-label={t.goldPanel.chartAria} className="h-full w-full">
              {chart.yTicks.map((tick) => (
                <g key={tick.y}>
                  <line x1={chart.left} x2={chart.right} y1={tick.y} y2={tick.y} stroke="#e6dfd3" strokeWidth="1" />
                  <text x={chart.left - 12} y={tick.y + 4} textAnchor="end" className="fill-muted text-[12px]">
                    {tick.label}
                  </text>
                </g>
              ))}
              {chart.xTicks.map((tick) => (
                <g key={tick.x}>
                  <line x1={tick.x} x2={tick.x} y1={chart.top} y2={chart.bottom} stroke="#f1ece3" strokeWidth="1" />
                  <text x={tick.x} y={chart.bottom + 28} textAnchor="middle" className="fill-muted text-[12px]">
                    {tick.label}
                  </text>
                </g>
              ))}
              <line x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.bottom} stroke="#d8cebf" strokeWidth="1.2" />
              <line x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom} stroke="#d8cebf" strokeWidth="1.2" />
              <text x={chart.left} y={24} className="fill-muted text-[12px]">
                {t.goldPanel.priceAxis}
              </text>
              <text x={chart.right} y={chart.bottom + 54} textAnchor="end" className="fill-muted text-[12px]">
                {t.goldPanel.timeAxis}
              </text>
              <path d={chart.areaPath} fill={positive ? "rgba(191,86,61,0.12)" : "rgba(47,111,94,0.12)"} />
              <path
                d={chart.linePath}
                fill="none"
                stroke={positive ? "#bf563d" : "#2f6f5e"}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.6"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

function buildChart(history: GoldHistory | null, locale: string) {
  const bounds = { left: 72, right: 724, top: 28, bottom: 286 };
  if (!history || history.points.length < 2) {
    return {
      ...bounds,
      linePath: "",
      areaPath: "",
      xTicks: [] as Array<{ x: number; label: string }>,
      yTicks: [] as Array<{ y: number; label: string }>,
    };
  }

  const points = history.points;
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.08 || Math.max(max * 0.02, 1);
  const minPrice = min - padding;
  const maxPrice = max + padding;
  const spread = maxPrice - minPrice || 1;
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;

  const linePath = points
    .map((point, index) => {
      const x = bounds.left + (index / (points.length - 1)) * width;
      const y = bounds.bottom - ((point.price - minPrice) / spread) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPath = `${linePath} L ${bounds.right} ${bounds.bottom} L ${bounds.left} ${bounds.bottom} Z`;
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = minPrice + (spread / 4) * index;
    const y = bounds.bottom - ((value - minPrice) / spread) * height;
    return { y, label: formatPriceTick(value, history.currency) };
  }).reverse();
  const tickIndexes = uniqueTickIndexes(points.length, 5);
  const xTicks = tickIndexes.map((index) => ({
    x: bounds.left + (index / (points.length - 1)) * width,
    label: formatDateTick(points[index].date, history.range, locale),
  }));

  return { ...bounds, linePath, areaPath, xTicks, yTicks };
}

function uniqueTickIndexes(total: number, count: number) {
  return Array.from({ length: Math.min(total, count) }, (_, index) => {
    if (count === 1) return 0;
    return Math.round((index / (count - 1)) * (total - 1));
  }).filter((index, position, indexes) => indexes.indexOf(index) === position);
}

function formatDateTick(value: string, range: GoldRange, locale: string) {
  const date = new Date(value);
  if (range === "1y") {
    return date.toLocaleDateString(locale, { year: "2-digit", month: "numeric" });
  }
  return date.toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

function formatPriceTick(value: number, currency: string) {
  if (currency === "CNY") return `¥${Math.round(value).toLocaleString("en-US")}`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
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
