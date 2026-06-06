import { describe, expect, it } from "vitest";
import { formatClockTime, formatCurrency, formatUnitPrice } from "@/lib/utils/format";

describe("format utilities", () => {
  it("formats clock time with seconds for live quote fetches", () => {
    expect(formatClockTime("2026-05-20T03:30:04.000Z")).toMatch(/^\d{2}:\d{2}:04$/);
  });

  it("formats USD prices without the US currency prefix", () => {
    expect(formatCurrency(81.48, "USD")).toBe("$81.48");
    expect(formatCurrency(441.4, "HKD")).toBe("HK$441.40");
    expect(formatCurrency(2988, "JPY")).toBe("JP¥2,988");
  });

  it("keeps extra precision for unit prices", () => {
    expect(formatUnitPrice(6.1956, "CNY")).toBe("¥6.1956");
    expect(formatUnitPrice(6.1, "CNY")).toBe("¥6.10");
    expect(formatUnitPrice(81.4876, "USD")).toBe("$81.4876");
    expect(formatUnitPrice(2988, "JPY")).toBe("JP¥2,988");
  });
});
