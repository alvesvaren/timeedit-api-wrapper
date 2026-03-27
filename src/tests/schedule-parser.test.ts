import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  intervalsOverlapHalfOpen,
  parseBookingDivTitle,
  parseRoomWeekScheduleHtml,
} from "../parsers/schedule.js";

const harPath = path.join(
  process.cwd(),
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
    expect(schedule.days.length).toBe(7);
    const mon = schedule.days.find((d) => d.date === "2026-03-23");
    expect(mon?.busy.length).toBeGreaterThan(0);
  });
});
