import { DateTime, Duration } from "luxon";

/** Single IANA zone for all TimeEdit/Chalmers wall-clock semantics. */
export const TIMEEDIT_IANA_ZONE = "Europe/Stockholm";

const NAIVE_MINUTE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const NAIVE_WITH_SECONDS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/** `YYYY-MM-DDTHH:mm:ss` (parser output) → `YYYY-MM-DDTHH:mm`. */
export function naiveMinuteFromParser(naiveWithSeconds: string): string {
  if (!NAIVE_WITH_SECONDS_RE.test(naiveWithSeconds)) {
    throw new Error(`Expected naive datetime with seconds, got: ${naiveWithSeconds}`);
  }
  return naiveWithSeconds.slice(0, 16);
}

/**
 * Build API interval string from start/end naive minute datetimes (same format).
 * Usual: `YYYY-MM-DDTHH:mm/HH:mm`. Cross local midnight: full/full.
 */
export function formatLocalInterval(startMinute: string, endMinute: string): string {
  if (!NAIVE_MINUTE_RE.test(startMinute) || !NAIVE_MINUTE_RE.test(endMinute)) {
    throw new Error(`Expected YYYY-MM-DDTHH:mm for formatLocalInterval`);
  }
  const [d1] = startMinute.split("T");
  const [d2] = endMinute.split("T");
  const t2 = endMinute.split("T")[1]!;
  if (d1 === d2) {
    return `${startMinute}/${t2}`;
  }
  return `${startMinute}/${endMinute}`;
}

/** `2026-03-27 13:36` or `2026-03-27T13:36:00` → `2026-03-27T13:36`. */
export function normalizeCreatedAtMinute(raw: string): string {
  const t = raw.replace(/\u00a0/g, " ").trim();
  if (NAIVE_WITH_SECONDS_RE.test(t)) {
    return t.slice(0, 16);
  }
  if (NAIVE_MINUTE_RE.test(t)) {
    return t;
  }
  const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const [, ymd, hh, mm] = m;
    return `${ymd}T${hh!.padStart(2, "0")}:${mm}`;
  }
  throw new Error(`Unrecognized createdAt format: ${raw}`);
}

function assertFifteenMinuteGrid(dt: DateTime): void {
  if (dt.second !== 0 && dt.millisecond !== 0) {
    throw new Error(`Time must be on minute boundaries: ${dt.toISO()}`);
  }
  if (dt.minute % 15 !== 0) {
    throw new Error(`Times must align to 15-minute grid (got minute ${dt.minute})`);
  }
}

/**
 * Parse booking create `interval`: start/end (minute) or start + `PT…` duration.
 * Returns `date` + clock fields for TimeEdit `submitBooking`.
 */
export function parseIntervalForCreate(interval: string): {
  date: string;
  startTime: string;
  endTime: string;
} {
  const slash = interval.indexOf("/");
  if (slash === -1) {
    throw new Error("interval must contain a '/' separator");
  }
  const left = interval.slice(0, slash).trim();
  const right = interval.slice(slash + 1).trim();
  if (!NAIVE_MINUTE_RE.test(left)) {
    throw new Error(`interval start must be YYYY-MM-DDTHH:mm, got: ${left}`);
  }

  const start = DateTime.fromFormat(left, "yyyy-MM-dd'T'HH:mm", { zone: TIMEEDIT_IANA_ZONE });
  if (!start.isValid) {
    throw new Error(`Invalid interval start: ${start.invalidExplanation}`);
  }

  let end: DateTime;
  if (right.startsWith("P")) {
    const dur = Duration.fromISO(right);
    if (!dur.isValid) {
      throw new Error(`Invalid ISO duration: ${right}`);
    }
    end = start.plus(dur);
    if (!end.isValid) {
      throw new Error(`Invalid end after duration: ${end.invalidExplanation}`);
    }
  } else if (NAIVE_MINUTE_RE.test(right)) {
    end = DateTime.fromFormat(right, "yyyy-MM-dd'T'HH:mm", { zone: TIMEEDIT_IANA_ZONE });
  } else {
    const m = right.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      throw new Error(`interval end must be HH:mm, full minute datetime, or PT duration; got: ${right}`);
    }
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    end = start.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
  }

  if (!end.isValid) {
    throw new Error(`Invalid interval end: ${end.invalidExplanation}`);
  }

  assertFifteenMinuteGrid(start);
  assertFifteenMinuteGrid(end);

  if (start >= end) {
    throw new Error("interval end must be after start");
  }

  const d0 = start.toFormat("yyyy-MM-dd");
  const d1 = end.toFormat("yyyy-MM-dd");
  if (d0 !== d1) {
    throw new Error("Booking must not cross local midnight (Europe/Stockholm)");
  }

  return {
    date: d0,
    startTime: start.toFormat("H:mm"),
    endTime: end.toFormat("H:mm"),
  };
}
