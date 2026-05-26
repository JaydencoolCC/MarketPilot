import { describe, expect, it } from "vitest";
import { formatClockTime, formatCurrency } from "@/lib/utils/format";

describe("format utilities", () => {
  it("formats clock time with seconds for live quote fetches", () => {
    expect(formatClockTime("2026-05-20T03:30:04.000Z")).toMatch(/^\d{2}:\d{2}:04$/);
  });

  it("formats USD prices without the US currency prefix", () => {
    expect(formatCurrency(81.48, "USD")).toBe("$81.48");
    expect(formatCurrency(441.4, "HKD")).toBe("HK$441.40");
  });
});
