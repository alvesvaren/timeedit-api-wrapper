import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  intervalsOverlapHalfOpen,
  parseBookingDivTitle,
  parseLocalScheduleIso,
  parseRoomWeekScheduleHtml,
} from "../parsers/schedule.js";

const harPath = path.join(
  process.cwd(),
  "dumps",
  "cloud.timeedit.net_Archive [26-03-27 13-36-43].har"
);

describe("schedule parser", () => {
  test("parseBookingDivTitle handles Övrigt and plain ID", () => {
    expect(
      parseBookingDivTitle(" 2026-03-23 08:00 - 10:00  ID 174803")
    ).toEqual({
      date: "2026-03-23",
      startTime: "08:00",
      endTime: "10:00",
      reservationId: "174803",
      label: undefined,
    });
    expect(
      parseBookingDivTitle(" 2026-03-23 08:00 - 12:00 Övrigt ID 174859")
    ).toEqual({
      date: "2026-03-23",
      startTime: "08:00",
      endTime: "12:00",
      reservationId: "174859",
      label: "Övrigt",
    });
  });

  test("parseLocalScheduleIso", () => {
    expect(parseLocalScheduleIso("2026-03-23T08:15:00")).toEqual({
      date: "2026-03-23",
      time: "08:15",
    });
    expect(parseLocalScheduleIso("bad")).toBeNull();
  });

  test("intervalsOverlapHalfOpen", () => {
    expect(intervalsOverlapHalfOpen("11:00", "12:00", "11:30", "12:30")).toBe(
      true
    );
    expect(intervalsOverlapHalfOpen("11:00", "12:00", "12:00", "13:00")).toBe(
      false
    );
  });

  test.skipIf(!fs.existsSync(harPath))("parses multi-room HAR week grid", () => {
    const har = JSON.parse(fs.readFileSync(harPath, "utf8")) as {
      log: { entries: Array<{ request: { url: string }; response: { content: { text?: string } } }> };
    };
    const entry = har.log.entries.find((e) =>
      e.request.url.includes("ri16812")
    );
    expect(entry?.response?.content?.text).toBeDefined();
    const schedule = parseRoomWeekScheduleHtml(entry!.response.content.text!);
    expect(schedule.bookingRules).toContain("Grupprum");
    expect(schedule.gridDates.length).toBe(7);
    const mon = schedule.bookings.filter((b) => b.start.startsWith("2026-03-23"));
    expect(mon.length).toBeGreaterThan(0);
    expect(mon[0]!.start).toMatch(/^2026-03-23T\d{2}:\d{2}:00$/);
  });
});
