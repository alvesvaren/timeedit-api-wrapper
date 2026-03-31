import { describe, expect, test } from "vitest";
import {
  formatLocalInterval,
  naiveMinuteFromParser,
  normalizeCreatedAtMinute,
  parseIntervalForCreate,
  TIMEEDIT_IANA_ZONE,
} from "../timeedit-time.js";

describe("timeedit-time", () => {
  test("TIMEEDIT_IANA_ZONE is Europe/Stockholm", () => {
    expect(TIMEEDIT_IANA_ZONE).toBe("Europe/Stockholm");
  });

  test("naiveMinuteFromParser strips seconds", () => {
    expect(naiveMinuteFromParser("2026-03-28T11:15:00")).toBe("2026-03-28T11:15");
  });

  test("formatLocalInterval short vs full", () => {
    expect(formatLocalInterval("2026-03-31T09:15", "2026-03-31T11:15")).toBe(
      "2026-03-31T09:15/11:15"
    );
    expect(formatLocalInterval("2026-03-31T23:00", "2026-04-01T01:00")).toBe(
      "2026-03-31T23:00/2026-04-01T01:00"
    );
  });

  test("normalizeCreatedAtMinute", () => {
    expect(normalizeCreatedAtMinute("2026-03-27 13:36")).toBe("2026-03-27T13:36");
    expect(normalizeCreatedAtMinute("2026-03-27T13:36:00")).toBe("2026-03-27T13:36");
  });

  test("parseIntervalForCreate same day HH:mm end and duration", () => {
    expect(parseIntervalForCreate("2026-03-28T18:00/19:00")).toEqual({
      date: "2026-03-28",
      startTime: "18:00",
      endTime: "19:00",
    });
    expect(parseIntervalForCreate("2026-03-28T18:00/PT1H")).toEqual({
      date: "2026-03-28",
      startTime: "18:00",
      endTime: "19:00",
    });
  });

  test("parseIntervalForCreate rejects non-quarter grid", () => {
    expect(() => parseIntervalForCreate("2026-03-28T18:07/19:00")).toThrow();
  });

  test("parseIntervalForCreate rejects crossing midnight", () => {
    expect(() => parseIntervalForCreate("2026-03-28T23:00/PT4H")).toThrow();
  });
});
