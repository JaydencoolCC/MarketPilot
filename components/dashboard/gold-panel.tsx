"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GoldHistory, GoldRange, GoldScope } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

const scopes: Array<{ id: GoldScope; label: string }> = [
  { id: "international", label: "国际金价" },
  { id: "domestic", label: "人民币/克" },
];

const ranges: Array<{ id: GoldRange; label: string }> = [
  { id: "1d", label: "1天" },
  { id: "1m", label: "1月" },
  { id: "3m", label: "3月" },
  { id: "6m", label: "6月" },
  { id: "1y", label: "1年" },
];

export function GoldPanel() {
  const [scope, setScope] = useState<GoldScope>("international");
  const [range, setRange] = useState<GoldRange>("3m");
  const [history, setHistory] = useState<GoldHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("正在读取黄金历史价格。");

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
          setMessage(payload.error?.message ?? "黄金价格暂时不可用。");
          return;
        }
        setHistory(payload.data);
        setMessage(
          payload.data.scope === "domestic"
            ? "国内金价为国际金价按 USD/CNY 折算的人民币/克参考价。"
            : "国际金价使用美元/盎司口径。",
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("黄金价格暂时不可用。");
        }
      } finally {
        setLoading(false);
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [range, scope]);

  async function reloadHistory() {
    setLoading(true);
    try {
      const response = await fetch(`/api/gold/history?scope=${scope}&range=${range}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: GoldHistory; error?: { message: string } };
      if (!response.ok || !payload.data) {
        setMessage(payload.error?.message ?? "黄金价格暂时不可用。");
        return;
      }
      setHistory(payload.data);
      setMessage(
        payload.data.scope === "domestic"
          ? "国内金价为国际金价按 USD/CNY 折算的人民币/克参考价。"
          : "国际金价使用美元/盎司口径。",
      );
    } finally {
      setLoading(false);
    }
  }

  const chart = useMemo(() => buildChart(history), [history]);
  const positive = (history?.changePercent ?? 0) >= 0;

  return (
    <section className="rounded-lg border border-line bg-white/85 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">黄金走势</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
        <Button variant="secondary" size="icon" aria-label="刷新黄金价格" onClick={reloadHistory}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {scopes.map((item) => (
            <Button
              key={item.id}
              variant={scope === item.id ? "primary" : "secondary"}
              size="sm"
              onClick={() => setScope(item.id)}
            >
              {item.label}
            </Button>
          ))}
          <div className="mx-1 hidden h-8 w-px bg-line md:block" />
          {ranges.map((item) => (
            <Button
              key={item.id}
              variant={range === item.id ? "primary" : "secondary"}
              size="sm"
              onClick={() => setRange(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="当前价格" value={history ? formatCurrency(history.currentPrice, history.currency) : "-"} />
          <Metric
            label="区间涨跌"
            value={history ? formatPercent(history.changePercent) : "-"}
            className={positive ? "text-coral" : "text-moss"}
          />
          <Metric label="单位" value={history ? `每${history.unit}` : "-"} />
          <Metric label="来源" value={history?.provider ?? "-"} />
        </div>

        <div className="rounded-md border border-line bg-surface/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">
                {scope === "domestic" ? "人民币/克参考价" : "国际金价"}
              </div>
              <div className="mt-1 text-xs text-muted">
                {history ? `${history.points.length} 个价格点 · ${new Date(history.updatedAt).toLocaleString("zh-CN")}` : "等待数据"}
              </div>
            </div>
            <Badge tone={positive ? "red" : "green"}>{history ? formatPercent(history.changePercent) : "-"}</Badge>
          </div>

          <div className="mt-4 aspect-[16/7] w-full overflow-hidden rounded-md bg-white">
            <svg viewBox="0 0 760 340" role="img" aria-label="黄金价格时间走势图" className="h-full w-full">
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
                价格
              </text>
              <text x={chart.right} y={chart.bottom + 54} textAnchor="end" className="fill-muted text-[12px]">
                时间
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

function buildChart(history: GoldHistory | null) {
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
    label: formatDateTick(points[index].date, history.range),
  }));

  return { ...bounds, linePath, areaPath, xTicks, yTicks };
}

function uniqueTickIndexes(total: number, count: number) {
  return Array.from({ length: Math.min(total, count) }, (_, index) => {
    if (count === 1) return 0;
    return Math.round((index / (count - 1)) * (total - 1));
  }).filter((index, position, indexes) => indexes.indexOf(index) === position);
}

function formatDateTick(value: string, range: GoldRange) {
  const date = new Date(value);
  if (range === "1y") {
    return date.toLocaleDateString("zh-CN", { year: "2-digit", month: "numeric" });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function formatPriceTick(value: number, currency: string) {
  if (currency === "CNY") return `¥${Math.round(value).toLocaleString("zh-CN")}`;
  return `$${Math.round(value).toLocaleString("zh-CN")}`;
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
