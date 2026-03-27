import { parse } from "node-html-parser";
import type { Booking } from "./types.js";

/**
 * Parse TimeEdit "my bookings" HTML table into structured rows.
 */
export function parseMyBookingsHtml(html: string): Booking[] {
  const root = parse(html, { blockTextElements: { script: true, style: true } });
  const rows = root.querySelectorAll("tr.rr[data-id]");
  const bookings: Booking[] = [];

  for (const tr of rows) {
    const id = tr.getAttribute("data-id");
    if (!id) continue;

    const timeCell = tr.querySelector("td.time");
    const text = timeCell?.text?.replace(/\u00a0/g, " ").trim() ?? "";
    // e.g. "2026-03-28   11:15 - 12:15"
    const timeMatch = text.match(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
    );
    if (!timeMatch) continue;

    const [, date, startTime, endTime] = timeMatch;

    // Typical row: [spacer][time td.time][room td.column0][duration td.column1][created td.column0]
    const cells = tr.querySelectorAll(":scope > td");
    let roomName = "";
    let createdAt = "";
    if (cells.length >= 5) {
      roomName = cells[2]!.text.trim();
      createdAt = cells[4]!.text.trim();
    } else {
      for (const td of cells) {
        const cls = td.getAttribute("class") ?? "";
        if (!cls.includes("column0") || cls.includes("totallength")) continue;
        const cellText = td.text.trim();
        if (!cellText) continue;
        if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(cellText)) {
          createdAt = cellText;
        } else if (!roomName) {
          roomName = cellText;
        }
      }
    }

    bookings.push({
      id,
      date,
      startTime: normalizeTime(startTime),
      endTime: normalizeTime(endTime),
      roomName,
      createdAt,
    });
  }

  return bookings;
}

function normalizeTime(t: string): string {
  const [h, m] = t.split(":");
  return `${h!.padStart(2, "0")}:${m}`;
}
