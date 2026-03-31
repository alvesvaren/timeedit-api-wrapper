import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  intervalsOverlapHalfOpen,
  parseBookingDivTitle,
  parseCombinedRoomsWeekScheduleHtml,
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
    const schedule = parseCombinedRoomsWeekScheduleHtml(entry!.response.content.text!);
    expect(schedule.bookingRules).toContain("Grupprum");
    expect(schedule.gridDates.length).toBe(7);
    const mon = schedule.rooms.flatMap((r) => r.bookings).filter((b) => b.start.startsWith("2026-03-23"));
    expect(mon.length).toBeGreaterThan(0);
    expect(mon[0]!.start).toMatch(/^2026-03-23T\d{2}:\d{2}:00$/);
  });

  test("parseRoomWeekScheduleHtml still works for single-room fragment", () => {
    const html = `
<div class="textHTML"><br>R</div>
<div class="weekDay" data-day="20260330">
  <div class="weekDiv" data-hourHeight="13" style="height: 40px;">
    <div class="weekHourLine">
      <div class="hour" data-object="501.4"></div>
    </div>
    <div class="bookingDiv" style="top: 0px;" title=" 2026-03-30 08:00 - 09:00  ID 9"></div>
  </div>
</div>`;
    const s = parseRoomWeekScheduleHtml(html);
    expect(s.bookings.map((b) => b.reservationId)).toEqual(["9"]);
  });

  test("parseCombined assigns rows to room ids (two-room strip)", () => {
    const html = `
<div class="textHTML"><br>Rules here</div>
<div class="weekDay" data-day="20260330">
  <div class="weekDiv" data-hourHeight="13" style="height: 80px;">
    <div class="weekHourLine">
      <div class="hour" data-object="501.4"></div>
      <div class="hour" data-object="502.4"></div>
    </div>
    <div class="bookingDiv" style="top: 0px;" title=" 2026-03-30 08:00 - 09:00  ID 1001"></div>
    <div class="bookingDiv" style="top: 40px;" title=" 2026-03-30 10:00 - 11:00  ID 1002"></div>
  </div>
</div>`;
    const s = parseCombinedRoomsWeekScheduleHtml(html);
    const b501 = s.rooms.find((r) => r.roomId === "501")?.bookings ?? [];
    const b502 = s.rooms.find((r) => r.roomId === "502")?.bookings ?? [];
    expect(b501.map((x) => x.reservationId)).toEqual(["1001"]);
    expect(b502.map((x) => x.reservationId)).toEqual(["1002"]);
  });
});
