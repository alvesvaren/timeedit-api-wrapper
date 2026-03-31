import { parse, type HTMLElement } from "node-html-parser";

/** One row parsed from TimeEdit `my.html`. Prefer {@link tryRoomIdFromBookingRow} via `roomId`; listing falls back to name → id from the room catalog when HTML omits `objects=`. */
export type ParsedMyBookingRow = {
  id: string;
  start: string;
  end: string;
  roomName: string;
  createdAtRaw: string;
  /** TimeEdit room object id when present on the row (`objects=…` / `data-objects`). */
  roomId?: string;
};

const DEFAULT_HREF_BASE = "https://cloud.timeedit.net/chalmers/web/student/";

/**
 * Reads `data-sid` from `#linksdata` on the full "Mina bokningar" HTML page (see `loadMyRes` in TimeEdit).
 */
export function parseLinksDataSidFromMyBookingsBootstrap(html: string): string | undefined {
  const m = html.match(/\bid\s*=\s*["']linksdata["'][^>]*\bdata-sid\s*=\s*["']([^"']*)["']/i);
  return m?.[1]?.trim() || undefined;
}

/**
 * TimeEdit encodes room (+ type) in `objects`, e.g. `485.4` → room id `485`.
 */
export function parseTimeEditObjectsId(objectsParam: string | null | undefined): string | undefined {
  if (!objectsParam?.trim()) return undefined;
  const segment = objectsParam.split(/[;,]/)[0]!.trim();
  const m = segment.match(/^(\d+)(?:\.\d+)?$/);
  return m?.[1];
}

function tryRoomIdFromBookingRow(tr: HTMLElement): string | undefined {
  for (const attr of ["data-objects", "data-object"]) {
    const raw = tr.getAttribute(attr);
    const id = parseTimeEditObjectsId(raw) ?? (raw?.trim() && /^\d+$/.test(raw.trim()) ? raw.trim() : undefined);
    if (id) return id;
  }

  for (const a of tr.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) continue;
    try {
      const u = new URL(href, DEFAULT_HREF_BASE);
      const fromObjects = parseTimeEditObjectsId(u.searchParams.get("objects"));
      if (fromObjects) return fromObjects;
    } catch {
      const m = href.match(/[?&]objects=([^&]+)/i);
      if (m) {
        const id = parseTimeEditObjectsId(decodeURIComponent(m[1]!));
        if (id) return id;
      }
    }
  }

  const onclick = tr.getAttribute("onclick") ?? "";
  const inline = onclick.match(/objects=([^&'"?)]+)/i);
  if (inline) {
    const id = parseTimeEditObjectsId(decodeURIComponent(inline[1]!));
    if (id) return id;
  }

  return undefined;
}

/**
 * Parse TimeEdit "my bookings" HTML table into structured rows.
 */
function rowHasRrClass(tr: HTMLElement): boolean {
  return (tr.getAttribute("class") ?? "").split(/\s+/).includes("rr");
}

export function parseMyBookingsHtml(html: string): ParsedMyBookingRow[] {
  const root = parse(html, { blockTextElements: { script: true, style: true } });
  const bookings: ParsedMyBookingRow[] = [];

  for (const tr of root.querySelectorAll("tr[data-id]")) {
    if (!rowHasRrClass(tr)) continue;

    const id = tr.getAttribute("data-id");
    if (!id) continue;

    const timeCell = tr.querySelector("td.time");
    const text =
      (timeCell?.text ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/&nbsp;/gi, " ")
        .trim();
    // e.g. "2026-03-28   11:15 - 12:15"
    const timeMatch = text.match(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
    );
    if (!timeMatch) continue;

    const [, date, startTime, endTime] = timeMatch;

    const cells = tr.querySelectorAll(":scope > td");
    let roomName = "";
    let createdAtRaw = "";
    if (cells.length >= 5) {
      roomName = cells[2]!.text.replace(/&nbsp;/gi, " ").replace(/\u00a0/g, " ").trim();
      createdAtRaw = cells[4]!.text.replace(/&nbsp;/gi, " ").replace(/\u00a0/g, " ").trim();
    } else {
      for (const td of cells) {
        const cls = td.getAttribute("class") ?? "";
        if (!cls.includes("column0") || cls.includes("totallength")) continue;
        const cellText = td.text.trim();
        if (!cellText) continue;
        if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(cellText)) {
          createdAtRaw = cellText;
        } else if (!roomName) {
          roomName = cellText;
        }
      }
    }

    const roomId = tryRoomIdFromBookingRow(tr);

    bookings.push({
      id,
      start: toNaiveLocalIso(date!, startTime!),
      end: toNaiveLocalIso(date!, endTime!),
      roomName,
      createdAtRaw,
      ...(roomId ? { roomId } : {}),
    });
  }

  return bookings;
}

function normalizeTime(t: string): string {
  const [h, m] = t.split(":");
  return `${h!.padStart(2, "0")}:${m}`;
}

/** `YYYY-MM-DD` + `H:mm` → `YYYY-MM-DDTHH:mm:00` (TimeEdit naive local convention). */
function toNaiveLocalIso(date: string, hhmm: string): string {
  return `${date}T${normalizeTime(hhmm)}:00`;
}
