import { describe, expect, test } from "vitest";
import { app } from "../app.js";

const token = process.env.TIMEEDIT_TOKEN;
/** Room numeric id (objects.json id), e.g. "485" for KG34 */
const testRoomId = process.env.E2E_ROOM_ID ?? "485";

const STOCKHOLM_TZ = "Europe/Stockholm";

function stockholmYmdParts(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d };
}

function addCalendarDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function ymdToString(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Gregorian weekday 0=Sun .. 6=Sat for civil Y-M-D */
function isSaturday(y: number, m: number, d: number): boolean {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
}

function stockholmNowYmd(now: Date): string {
  const { y, m, d } = stockholmYmdParts(now);
  return ymdToString(y, m, d);
}

function stockholmHourMinute(now: Date): { h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STOCKHOLM_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return {
    h: Number(parts.find((p) => p.type === "hour")!.value),
    min: Number(parts.find((p) => p.type === "minute")!.value),
  };
}

/**
 * True if the end of the slot (`endHm` on civil `ymd` in Stockholm) is still strictly after `now` in Stockholm.
 */
function isEndTimeInFuture(ymd: string, endHm: string, now: Date): boolean {
  const nowYmd = stockholmNowYmd(now);
  const [eh, em] = endHm.split(":").map(Number);
  const { h: ch, min: cmin } = stockholmHourMinute(now);
  if (ymd > nowYmd) return true;
  if (ymd < nowYmd) return false;
  return ch < eh || (ch === eh && cmin < em);
}

/**
 * Next Saturday in Stockholm where 18:00–19:00 is still in the future.
 * Saturday evening is usually free in the UI grid but remains bookable via the API.
 */
function defaultSaturdayEveningSlot(): { date: string; startTime: string; endTime: string } {
  const startTime = "18:00";
  const endTime = "19:00";
  const now = new Date();
  const { y: sy, m: sm, d: sd } = stockholmYmdParts(now);
  for (let delta = 0; delta < 60; delta++) {
    const { y, m, d } = addCalendarDays(sy, sm, sd, delta);
    if (!isSaturday(y, m, d)) continue;
    const date = ymdToString(y, m, d);
    if (!isEndTimeInFuture(date, endTime, now)) continue;
    return { date, startTime, endTime };
  }
  throw new Error("Could not find a future Saturday evening slot in the next 60 days");
}

const slot = process.env.E2E_BOOKING_DATE
  ? {
      date: process.env.E2E_BOOKING_DATE,
      startTime: process.env.E2E_START_TIME ?? "18:00",
      endTime: process.env.E2E_END_TIME ?? "19:00",
    }
  : defaultSaturdayEveningSlot();

const bookingDate = slot.date;
const bookingStartTime = slot.startTime;
const bookingEndTime = slot.endTime;

describe.skipIf(!token).sequential("e2e TimeEdit lifecycle", () => {
  const authHeader = { Authorization: `Bearer ${token}` };

  test("GET /api/bookings returns all room week grids", async () => {
    const roomsRes = await app.request("/api/rooms", { headers: authHeader });
    expect(roomsRes.status).toBe(200);
    const listed = (await roomsRes.json()) as Array<{ id: string }>;

    const res = await app.request("/api/bookings", { headers: authHeader });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      weekOffset: number;
      bookingRules: string;
      rooms: Array<{ id: string; name: string; bookings: unknown[] }>;
      errors?: unknown[];
    };
    expect(data.weekOffset).toBe(0);
    expect(data.bookingRules.length).toBeGreaterThan(20);
    expect(data.rooms).toHaveLength(listed.length);
    for (const r of data.rooms) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(Array.isArray(r.bookings)).toBe(true);
      for (const b of r.bookings as Array<{ start: string; end: string }>) {
        expect(b.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        expect(b.end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      }
    }
    if (data.errors?.length) {
      throw new Error(`Unexpected schedule fetch errors: ${JSON.stringify(data.errors)}`);
    }
  });

  test("GET /api/bookings filters by roomIds", async () => {
    const res = await app.request(
      `/api/bookings?roomIds=${encodeURIComponent(testRoomId)}`,
      { headers: authHeader }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { rooms: Array<{ id: string }> };
    expect(data.rooms).toHaveLength(1);
    expect(data.rooms[0]!.id).toBe(testRoomId);
  });

  test("GET /api/rooms returns rooms", async () => {
    const res = await app.request("/api/rooms", { headers: authHeader });
    expect(res.status).toBe(200);
    const rooms = (await res.json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(rooms)).toBe(true);
    expect(rooms.length).toBeGreaterThan(0);
    const first = rooms[0]!;
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("campus");
  });

  let reservationId: string;

  test("POST /api/my/bookings creates a booking", async () => {
    const res = await app.request("/api/my/bookings", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: testRoomId,
        date: bookingDate,
        startTime: bookingStartTime,
        endTime: bookingEndTime,
        title: "e2e-api-wrapper",
        comment: "automated test",
      }),
    });
    if (res.status !== 200) {
      console.error(await res.text());
    }
    expect(res.status).toBe(200);
    const data = (await res.json()) as { booking?: { id?: string } };
    expect(data.booking?.id).toBeDefined();
    reservationId = data.booking!.id!;
  });

  test("GET /api/my/bookings includes new booking", async () => {
    const res = await app.request("/api/my/bookings", { headers: authHeader });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{
      id: string;
      start: string;
      end: string;
      room: { name: string };
    }>;
    const row = list.find((b) => b.id === reservationId);
    expect(row).toBeDefined();
    expect(row!.start).toBe(`${bookingDate}T${bookingStartTime}:00`);
    expect(row!.end).toBe(`${bookingDate}T${bookingEndTime}:00`);
    expect(row!.room.name.length).toBeGreaterThan(0);
  });

  test("DELETE /api/my/bookings/:id cancels", async () => {
    const res = await app.request(`/api/my/bookings/${reservationId}`, {
      method: "DELETE",
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success?: boolean };
    expect(data.success).toBe(true);
  });

  test("GET /api/my/bookings no longer lists cancelled booking", async () => {
    const res = await app.request("/api/my/bookings", { headers: authHeader });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.find((b) => b.id === reservationId)).toBeUndefined();
  });
});

describe("auth required", () => {
  test("POST /api/auth/login without token is not blocked by bearer middleware", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/rooms without token returns 401", async () => {
    const res = await app.request("/api/rooms");
    expect(res.status).toBe(401);
  });

  test("GET /api/bookings without token returns 401", async () => {
    const res = await app.request("/api/bookings");
    expect(res.status).toBe(401);
  });

  test("GET /api/my/bookings without token returns 401", async () => {
    const res = await app.request("/api/my/bookings");
    expect(res.status).toBe(401);
  });
});
