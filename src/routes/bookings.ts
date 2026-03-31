import type { Context } from "hono";
import type { AuthVars } from "../middleware/auth.js";
import type { MyBooking } from "../entities.js";
import { parseMyBookingsHtml } from "../parsers.js";
import {
  cancelBooking,
  dateToCompact,
  fetchCsrfToken,
  fetchGroupRooms,
  fetchMyBookingsHtml,
  submitBooking,
} from "../timeedit.js";
import type { CreateBookingInput, Room } from "../schemas.js";
import { createBookingSchema } from "../schemas.js";
import {
  formatLocalInterval,
  naiveMinuteFromParser,
  normalizeCreatedAtMinute,
  parseIntervalForCreate,
} from "../timeedit-time.js";
import { mapGroupRoomObjects } from "./rooms.js";

function buildRoomNameToId(rooms: Room[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rooms) {
    const name = r.name.trim();
    const full = name.toLowerCase();
    if (!m.has(full)) m.set(full, r.id);
    const beforeComma = name.split(",")[0]!.trim().toLowerCase();
    if (beforeComma && beforeComma !== full && !m.has(beforeComma)) {
      m.set(beforeComma, r.id);
    }
  }
  return m;
}

function resolveRoomIdFromCatalog(
  roomName: string,
  nameToId: Map<string, string>
): string | undefined {
  const full = roomName.trim().toLowerCase();
  const short = roomName.split(",")[0]!.trim().toLowerCase();
  return nameToId.get(full) ?? nameToId.get(short);
}

export async function listBookingsHandler(c: Context<{ Variables: AuthVars }>) {
  const sessionCookie = c.get("sessionCookie");
  try {
    const [html, rawRooms] = await Promise.all([
      fetchMyBookingsHtml(sessionCookie),
      fetchGroupRooms(sessionCookie),
    ]);
    const rows = parseMyBookingsHtml(html);
    const nameToId = buildRoomNameToId(mapGroupRoomObjects(rawRooms));

    const list: MyBooking[] = [];
    for (const row of rows) {
      const roomId = row.roomId ?? resolveRoomIdFromCatalog(row.roomName, nameToId);
      if (!roomId) {
        throw new Error(
          `Could not resolve room id for my-bookings row (reservation ${row.id}, room "${row.roomName}")`
        );
      }
      const startM = naiveMinuteFromParser(row.start);
      const endM = naiveMinuteFromParser(row.end);
      const interval = formatLocalInterval(startM, endM);
      let createdAt: string;
      try {
        createdAt =
          row.createdAtRaw.trim().length > 0
            ? normalizeCreatedAtMinute(row.createdAtRaw)
            : startM;
      } catch {
        createdAt = startM;
      }
      const item: MyBooking = {
        id: row.id,
        interval,
        roomId,
        createdAt,
      };
      list.push(item);
    }

    return c.json(list, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Failed to list bookings", detail: message }, 502);
  }
}

/** Used when body is pre-validated by OpenAPI middleware. */
export async function createBookingFromInput(
  c: Context<{ Variables: AuthVars }>,
  input: CreateBookingInput
) {
  const sessionCookie = c.get("sessionCookie");
  let times: ReturnType<typeof parseIntervalForCreate>;
  try {
    times = parseIntervalForCreate(input.interval);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return c.json(
      {
        error: "Validation failed",
        issues: { interval: [detail] },
      },
      400
    );
  }

  try {
    const csrf = await fetchCsrfToken(sessionCookie);
    const reservationId = await submitBooking(sessionCookie, csrf, {
      roomId: input.roomId,
      datesCompact: dateToCompact(times.date),
      startTime: times.startTime,
      endTime: times.endTime,
      title: input.title,
      comment: input.comment,
    });
    return c.json({ booking: { id: reservationId } }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Booking failed", detail: message }, 502);
  }
}

/** Used for non-OpenAPI callers; validates JSON body. */
export async function createBookingHandler(c: Context<{ Variables: AuthVars }>) {
  const sessionCookie = c.get("sessionCookie");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", issues: zodIssuesToRecord(parsed.error) },
      400
    );
  }

  return createBookingFromInput(c, parsed.data);
}

function zodIssuesToRecord(err: import("zod").ZodError): Record<string, unknown> {
  return {
    formErrors: err.flatten().formErrors,
    fieldErrors: err.flatten().fieldErrors,
  };
}

export async function deleteBookingById(
  c: Context<{ Variables: AuthVars }>,
  reservationId: string
) {
  const sessionCookie = c.get("sessionCookie");
  if (!reservationId) {
    return c.json({ error: "Missing booking id" }, 400);
  }

  try {
    await cancelBooking(sessionCookie, reservationId);
    return c.json({ success: true as const }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Cancel failed", detail: message }, 502);
  }
}

export async function deleteBookingHandler(c: Context<{ Variables: AuthVars }>) {
  const id = c.req.param("id") ?? "";
  return deleteBookingById(c, id);
}
