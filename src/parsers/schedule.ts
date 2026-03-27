import { parse } from "node-html-parser";
import type { RoomCalendarSlot } from "../entities.js";

/** Full parse result; `gridDates` is for server-side logic only (empty days have no bookings). */
export type ParsedRoomViewSchedule = {
  bookingRules: string;
  bookings: RoomCalendarSlot[];
  gridDates: string[];
};

function normalizeTime(t: string): string {
  const [h, m] = t.split(":");
  return `${h!.padStart(2, "0")}:${m}`;
}

function toLocalIso(date: string, hhmm: string): string {
  return `${date}T${normalizeTime(hhmm)}:00`;
}

/**
 * Parse `title` on bookingDiv, e.g. "2026-03-23 08:00 - 10:00  ID 174803" or "... Övrigt ID 174859".
 */
export function parseBookingDivTitle(title: string): {
  date: string;
  startTime: string;
  endTime: string;
  reservationId?: string;
  label?: string;
} | null {
  const t = title.trim().replace(/\s+/g, " ");
  const head = t.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\b/
  );
  if (!head) return null;
  const date = head[1]!;
  const startTime = normalizeTime(head[2]!);
  const endTime = normalizeTime(head[3]!);
  const rest = t.slice(head[0].length).trim();
  const idMatch = rest.match(/ID\s+(\d+)\s*$/i);
  const reservationId = idMatch?.[1];
  const labelRaw = rest.replace(/ID\s+\d+\s*$/i, "").trim();
  const label: string | undefined = labelRaw === "" ? undefined : labelRaw;
  return { date, startTime, endTime, reservationId, label };
}

function compactDayToIso(compact: string): string | null {
  if (!/^\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/** Parse naive local `YYYY-MM-DDTHH:mm:ss` from the schedule API. */
export function parseLocalScheduleIso(iso: string): { date: string; time: string } | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2}):(\d{2})$/);
  if (!m) return null;
  return { date: m[1]!, time: normalizeTime(m[2]!) };
}

/**
 * Parse the week grid HTML returned by `ri.html` (single room in `objects`).
 */
export function parseRoomWeekScheduleHtml(html: string): ParsedRoomViewSchedule {
  const root = parse(html, { blockTextElements: { script: true, style: true } });

  const rulesEl = root.querySelector("div.textHTML");
  const rulesHtml = rulesEl?.innerHTML ?? "";
  const bookingRules = rulesHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const gridDates: string[] = [];
  const bookings: RoomCalendarSlot[] = [];

  for (const wd of root.querySelectorAll("div.weekDay[data-day]")) {
    const compact = wd.getAttribute("data-day") ?? "";
    const date = compactDayToIso(compact);
    if (!date) continue;
    gridDates.push(date);

    for (const node of wd.querySelectorAll("div.bookingDiv[title]")) {
      const title = node.getAttribute("title") ?? "";
      const parsed = parseBookingDivTitle(title);
      if (!parsed || parsed.date !== date) continue;
      bookings.push({
        start: toLocalIso(parsed.date, parsed.startTime),
        end: toLocalIso(parsed.date, parsed.endTime),
        reservationId: parsed.reservationId,
        label: parsed.label,
      });
    }
  }

  gridDates.sort((a, b) => a.localeCompare(b));
  bookings.sort((a, b) => a.start.localeCompare(b.start));

  return { bookingRules, bookings, gridDates };
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** True if [aStart, aEnd) overlaps [bStart, bEnd) (half-open intervals, same as typical booking UI). */
export function intervalsOverlapHalfOpen(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if ([as, ae, bs, be].some((n) => Number.isNaN(n))) return true;
  return as < be && bs < ae;
}
