import type { Context } from "hono";
import type { AuthVars } from "../middleware/auth.js";
import type { ReservationSlot, Room } from "../entities.js";
import { parseRoomWeekScheduleHtml } from "../parsers/schedule.js";
import type { AllRoomsBookingsResponse } from "../schemas.js";
import { formatLocalInterval, naiveMinuteFromParser } from "../timeedit-time.js";
import { fetchGroupRooms, fetchRoomWeekGridHtml } from "../timeedit.js";
import { mapGroupRoomObjects } from "./rooms.js";

const SCHEDULE_FETCH_CONCURRENCY = 5;

async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type AllBookingsQuery = {
  weekOffset: number;
  campus?: string;
  q?: string;
  roomIds?: string[];
};

function slotToReservationSlot(slot: {
  start: string;
  end: string;
  reservationId?: string;
  label?: string;
}): ReservationSlot {
  const startM = naiveMinuteFromParser(slot.start);
  const endM = naiveMinuteFromParser(slot.end);
  const interval = formatLocalInterval(startM, endM);
  const row: ReservationSlot = { interval };
  if (slot.reservationId) row.id = slot.reservationId;
  if (slot.label) row.label = slot.label;
  return row;
}

export async function allRoomBookingsHandler(
  c: Context<{ Variables: AuthVars }>,
  q: AllBookingsQuery
) {
  const sessionCookie = c.get("sessionCookie");
  const weekOffset = q.weekOffset;

  try {
    const raw = await fetchGroupRooms(sessionCookie);
    let rooms = mapGroupRoomObjects(raw);

    if (q.roomIds?.length) {
      const allow = new Set(q.roomIds);
      rooms = rooms.filter((r) => allow.has(r.id));
    }

    if (q.campus?.trim()) {
      const needle = q.campus.trim().toLowerCase();
      rooms = rooms.filter((r) => r.campus.toLowerCase().includes(needle));
    }

    if (q.q?.trim()) {
      const needle = q.q.trim().toLowerCase();
      rooms = rooms.filter((r) => r.name.toLowerCase().includes(needle));
    }

    type FetchOutcome =
      | { ok: true; room: Room; bookings: ReservationSlot[]; bookingRules: string }
      | { ok: false; roomId: string; detail: string };

    const outcomes = await mapPool(rooms, SCHEDULE_FETCH_CONCURRENCY, async (room) => {
      try {
        const html = await fetchRoomWeekGridHtml(sessionCookie, room.id, weekOffset);
        const parsed = parseRoomWeekScheduleHtml(html);
        const bookings = parsed.bookings.map(slotToReservationSlot);
        return {
          ok: true,
          room,
          bookings,
          bookingRules: parsed.bookingRules,
        } satisfies FetchOutcome;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return { ok: false, roomId: room.id, detail } satisfies FetchOutcome;
      }
    });

    let bookingRules = "";
    const roomsOut: Array<Room & { bookings: ReservationSlot[] }> = [];
    const errors: Array<{ roomId: string; detail: string }> = [];

    for (const o of outcomes) {
      if (o.ok) {
        if (!bookingRules) bookingRules = o.bookingRules;
        roomsOut.push({ ...o.room, bookings: o.bookings });
      } else {
        errors.push({ roomId: o.roomId, detail: o.detail });
      }
    }

    if (!bookingRules && roomsOut.length === 0 && errors.length === rooms.length && rooms.length > 0) {
      return c.json(
        {
          error: "Failed to load room bookings for all rooms",
          detail: errors.map((e) => `${e.roomId}: ${e.detail}`).join("; "),
        },
        502
      );
    }

    const body: AllRoomsBookingsResponse = {
      bookingRules,
      rooms: roomsOut,
      ...(errors.length ? { errors } : {}),
    };

    return c.json(body, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Failed to load room bookings", detail: message }, 502);
  }
}
