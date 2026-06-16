"use client";

import { useEffect, useRef, useState } from "react";
import { AssetNav, type DashboardView } from "@/components/dashboard/asset-nav";
import { useLocale } from "@/components/i18n/locale-provider";

type DashboardLayoutProps = {
  active: DashboardView;
  main: React.ReactNode;
  aside: React.ReactNode;
};

const DEFAULT_MAIN_WIDTH = 1120;
const MIN_MAIN_WIDTH = 820;
const MIN_ASIDE_WIDTH = 320;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function DashboardLayout({ active, main, aside }: DashboardLayoutProps) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mainWidthRef = useRef(DEFAULT_MAIN_WIDTH);
  const [mainWidth, setMainWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_MAIN_WIDTH;
    const saved = window.localStorage.getItem("trade-dashboard-main-width");
    return saved ? Number(saved) : DEFAULT_MAIN_WIDTH;
  });

  useEffect(() => {
    mainWidthRef.current = mainWidth;
  }, [mainWidth]);

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    const container = containerRef.current;
    if (!container) return;

    const startX = event.clientX;
    const startWidth = mainWidth;
    const maxWidth = Math.max(MIN_MAIN_WIDTH, container.clientWidth - MIN_ASIDE_WIDTH - 180);
    event.currentTarget.setPointerCapture(event.pointerId);

    function move(pointerEvent: PointerEvent) {
      const next = clamp(startWidth + pointerEvent.clientX - startX, MIN_MAIN_WIDTH, maxWidth);
      mainWidthRef.current = next;
      setMainWidth(next);
    }

    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.localStorage.setItem("trade-dashboard-main-width", String(mainWidthRef.current));
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <AssetNav active={active} />
      <div
        className="min-w-0 flex-none"
        style={{ width: `min(100%, ${mainWidth}px)` }}
      >
        {main}
      </div>
      <button
        type="button"
        aria-label={t.dashboard.resizeMain}
        className="hidden h-[calc(100vh-10rem)] w-2 cursor-col-resize rounded-full bg-line/70 transition hover:bg-moss/40 lg:block"
        onPointerDown={startResize}
      />
      <aside className="min-w-0 flex-1 space-y-5 lg:min-w-80">{aside}</aside>
    </div>
  );
}
