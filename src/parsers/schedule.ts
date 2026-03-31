import { parse, type HTMLElement } from "node-html-parser";
import type { RoomCalendarSlot } from "../entities.js";
import { parseTimeEditObjectsId } from "../parsers.js";

/** Full parse result; `gridDates` is for server-side logic only (empty days have no bookings). */
export type ParsedRoomViewSchedule = {
  bookingRules: string;
  bookings: RoomCalendarSlot[];
  gridDates: string[];
};

/** One combined `ri.html` response listing multiple rooms (comma-separated `objects`). */
export type ParsedCombinedRoomWeekSchedule = {
  bookingRules: string;
  gridDates: string[];
  rooms: Array<{ roomId: string; bookings: RoomCalendarSlot[] }>;
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

function resolveRowRoomIds(weekDiv: HTMLElement): string[] {
  const hourLine = weekDiv.querySelector(".weekHourLine");
  if (hourLine) {
    const ids: string[] = [];
    for (const el of hourLine.querySelectorAll(".hour[data-object]")) {
      const id = parseTimeEditObjectsId(el.getAttribute("data-object"));
      if (id) ids.push(id);
    }
    if (ids.length > 0) return ids;
  }
  const one = parseTimeEditObjectsId(weekDiv.getAttribute("data-object"));
  return one ? [one] : [];
}

function parseWeekDivStyleHeightPx(style: string | undefined): number | null {
  const m = style?.match(/\bheight:\s*(\d+)px/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseBookingDivTopPx(style: string | undefined): number {
  const m = style?.match(/\btop:\s*(\d+)px/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function parseCombinedRoomsWeekScheduleHtml(html: string): ParsedCombinedRoomWeekSchedule {
  const root = parse(html, { blockTextElements: { script: true, style: true } });

  const rulesEl = root.querySelector("div.textHTML");
  const rulesHtml = rulesEl?.innerHTML ?? "";
  const bookingRules = rulesHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const gridDatesSet = new Set<string>();
  const bookingsByRoom = new Map<string, RoomCalendarSlot[]>();

  for (const wd of root.querySelectorAll("div.weekDay[data-day]")) {
    const compact = wd.getAttribute("data-day") ?? "";
    const date = compactDayToIso(compact);
    if (!date) continue;
    gridDatesSet.add(date);

    const weekDiv =
      wd.querySelector("div.weekDiv[data-hourHeight]") ?? wd.querySelector("div.weekDiv[data-object]");
    if (!weekDiv) continue;

    const rowRoomIds = resolveRowRoomIds(weekDiv);
    if (rowRoomIds.length === 0) continue;

    const totalH =
      parseWeekDivStyleHeightPx(weekDiv.getAttribute("style")) ?? 40 * rowRoomIds.length;
    const rowHeight = totalH / rowRoomIds.length;

    for (const id of rowRoomIds) {
      if (!bookingsByRoom.has(id)) bookingsByRoom.set(id, []);
    }

    for (const node of weekDiv.querySelectorAll("div.bookingDiv[title]")) {
      const title = node.getAttribute("title") ?? "";
      const parsedTitle = parseBookingDivTitle(title);
      if (!parsedTitle || parsedTitle.date !== date) continue;
      const top = parseBookingDivTopPx(node.getAttribute("style"));
      const row = Math.min(
        Math.max(0, Math.floor(top / rowHeight)),
        rowRoomIds.length - 1
      );
      const roomId = rowRoomIds[row]!;
      bookingsByRoom.get(roomId)!.push({
        start: toLocalIso(parsedTitle.date, parsedTitle.startTime),
        end: toLocalIso(parsedTitle.date, parsedTitle.endTime),
        reservationId: parsedTitle.reservationId,
        label: parsedTitle.label,
      });
    }
  }

  const gridDates = [...gridDatesSet].sort((a, b) => a.localeCompare(b));
  const rooms = [...bookingsByRoom.entries()]
    .map(([roomId, bookings]) => ({
      roomId,
      bookings: bookings.sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => a.roomId.localeCompare(b.roomId, undefined, { numeric: true }));

  return { bookingRules, gridDates, rooms };
}

/**
 * Parse the week grid HTML returned by `ri.html` for a **single** room (`objects` is one id).
 */
export function parseRoomWeekScheduleHtml(html: string): ParsedRoomViewSchedule {
  const c = parseCombinedRoomsWeekScheduleHtml(html);
  if (c.rooms.length === 0) {
    return { bookingRules: c.bookingRules, bookings: [], gridDates: c.gridDates };
  }
  if (c.rooms.length > 1) {
    throw new Error(`parseRoomWeekScheduleHtml: expected one room in HTML, got ${c.rooms.length}`);
  }
  const single = c.rooms[0]!;
  return {
    bookingRules: c.bookingRules,
    bookings: single.bookings,
    gridDates: c.gridDates,
  };
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
