import type { Context } from "hono";
import type { AuthVars } from "../middleware/auth.js";
import {
  intervalsOverlapHalfOpen,
  parseRoomWeekScheduleHtml,
} from "../parsers/schedule.js";
import { fetchRoomWeekGridHtml } from "../timeedit.js";

function normTime(t: string): string {
  const [h, m] = t.split(":");
  return `${h!.padStart(2, "0")}:${m}`;
}

export async function roomScheduleHandler(
  c: Context<{ Variables: AuthVars }>,
  roomId: string,
  weekOffset = 0
) {
  const sessionCookie = c.get("sessionCookie");
  try {
    const html = await fetchRoomWeekGridHtml(sessionCookie, roomId, weekOffset);
    const schedule = parseRoomWeekScheduleHtml(html);
    return c.json({ weekOffset, ...schedule }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Failed to load room schedule", detail: message }, 502);
  }
}

export type AvailabilityQuery = {
  date: string;
  startTime: string;
  endTime: string;
};

export async function roomAvailabilityFromQuery(
  c: Context<{ Variables: AuthVars }>,
  roomId: string,
  q: AvailabilityQuery
) {
  const sessionCookie = c.get("sessionCookie");
  const startTime = normTime(q.startTime);
  const endTime = normTime(q.endTime);

  try {
    const html = await fetchRoomWeekGridHtml(sessionCookie, roomId);
    const schedule = parseRoomWeekScheduleHtml(html);
    const day = schedule.days.find((d) => d.date === q.date);

    if (!day) {
      return c.json(
        {
          dateInLoadedWeek: false,
          bookingRules: schedule.bookingRules,
          date: q.date,
          startTime,
          endTime,
          conflicts: [],
          hint:
            "This date is not in the week TimeEdit returned. Call GET /api/rooms/{roomId}/schedule and use a date from `days`, or try again when the grid includes your date.",
        },
        200
      );
    }

    const conflicts = day.busy.filter((b) =>
      intervalsOverlapHalfOpen(startTime, endTime, b.startTime, b.endTime)
    );

    return c.json(
      {
        available: conflicts.length === 0,
        dateInLoadedWeek: true,
        bookingRules: schedule.bookingRules,
        date: q.date,
        startTime,
        endTime,
        conflicts,
      },
      200
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Failed to check availability", detail: message }, 502);
  }
}
