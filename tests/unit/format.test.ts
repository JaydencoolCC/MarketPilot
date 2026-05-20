import { describe, expect, it } from "vitest";
import { formatClockTime } from "@/lib/utils/format";

describe("format utilities", () => {
  it("formats clock time with seconds for live quote fetches", () => {
    expect(formatClockTime("2026-05-20T03:30:04.000Z")).toMatch(/^\d{2}:\d{2}:04$/);
  });
});
