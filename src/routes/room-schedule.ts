import type { Context } from "hono";
import type { AuthVars } from "../middleware/auth.js";
import type { ReservationSlot, Room } from "../entities.js";
import { parseCombinedRoomsWeekScheduleHtml } from "../parsers/schedule.js";
import type { AllRoomsBookingsResponse } from "../schemas.js";
import { formatLocalInterval, naiveMinuteFromParser } from "../timeedit-time.js";
import { fetchGroupRooms, fetchRoomsWeekGridHtml } from "../timeedit.js";
import { mapGroupRoomObjects } from "./rooms.js";

/** Rooms per `ri.html` request (comma-separated `objects=`); keeps URLs well under limits. */
const SCHEDULE_ROOM_BATCH_SIZE = 40;
const SCHEDULE_FETCH_CONCURRENCY = 4;

function chunkRooms<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

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

    type BatchOutcome =
      | { ok: true; batch: Room[]; parsed: ReturnType<typeof parseCombinedRoomsWeekScheduleHtml> }
      | { ok: false; batch: Room[]; detail: string };

    const batches = chunkRooms(rooms, SCHEDULE_ROOM_BATCH_SIZE);
    const outcomes = await mapPool(batches, SCHEDULE_FETCH_CONCURRENCY, async (batch) => {
      try {
        const html = await fetchRoomsWeekGridHtml(sessionCookie, batch.map((r) => r.id), weekOffset);
        const parsed = parseCombinedRoomsWeekScheduleHtml(html);
        return { ok: true, batch, parsed } satisfies BatchOutcome;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return { ok: false, batch, detail } satisfies BatchOutcome;
      }
    });

    let bookingRules = "";
    const errors: Array<{ roomId: string; detail: string }> = [];
    const bookingsByRoomId = new Map<string, ReservationSlot[]>();

    for (const o of outcomes) {
      if (!o.ok) {
        for (const r of o.batch) {
          errors.push({ roomId: r.id, detail: o.detail });
        }
        continue;
      }
      if (!bookingRules) bookingRules = o.parsed.bookingRules;
      for (const { roomId, bookings } of o.parsed.rooms) {
        bookingsByRoomId.set(roomId, bookings.map(slotToReservationSlot));
      }
    }

    const failedRoomIds = new Set(errors.map((e) => e.roomId));
    const roomsOut: Array<Room & { bookings: ReservationSlot[] }> = [];
    for (const room of rooms) {
      if (failedRoomIds.has(room.id)) continue;
      roomsOut.push({
        ...room,
        bookings: bookingsByRoomId.get(room.id) ?? [],
      });
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
