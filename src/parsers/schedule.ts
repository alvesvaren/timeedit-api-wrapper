import { parse } from "node-html-parser";

export type BusyInterval = {
  startTime: string;
  endTime: string;
  reservationId?: string;
  label?: string;
};

export type ScheduleDay = {
  date: string;
  busy: BusyInterval[];
};

export type RoomWeekSchedule = {
  /** Swedish policy text from TimeEdit (when/how group rooms may be booked). */
  bookingRules: string;
  days: ScheduleDay[];
};

function normalizeTime(t: string): string {
  const [h, m] = t.split(":");
  return `${h!.padStart(2, "0")}:${m}`;
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

/**
 * Parse the week grid HTML returned by `ri.html` (single room in `objects`).
 */
export function parseRoomWeekScheduleHtml(html: string): RoomWeekSchedule {
  const root = parse(html, { blockTextElements: { script: true, style: true } });

  const rulesEl = root.querySelector("div.textHTML");
  const rulesHtml = rulesEl?.innerHTML ?? "";
  const bookingRules = rulesHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const days: ScheduleDay[] = [];

  for (const wd of root.querySelectorAll("div.weekDay[data-day]")) {
    const compact = wd.getAttribute("data-day") ?? "";
    const date = compactDayToIso(compact);
    if (!date) continue;

    const busy: BusyInterval[] = [];
    for (const node of wd.querySelectorAll("div.bookingDiv[title]")) {
      const title = node.getAttribute("title") ?? "";
      const parsed = parseBookingDivTitle(title);
      if (!parsed || parsed.date !== date) continue;
      busy.push({
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        reservationId: parsed.reservationId,
        label: parsed.label,
      });
    }

    busy.sort((a, b) => a.startTime.localeCompare(b.startTime));
    days.push({ date, busy });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  return { bookingRules, days };
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
