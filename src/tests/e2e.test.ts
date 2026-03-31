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
 * True if civil `startHm` on `ymd` (Stockholm) is strictly after `now` in Stockholm.
 */
function isSlotStartInFuture(ymd: string, startHm: string, now: Date): boolean {
  const nowYmd = stockholmNowYmd(now);
  const [sh, sm] = startHm.split(":").map(Number);
  const { h: ch, min: cmin } = stockholmHourMinute(now);
  if (ymd > nowYmd) return true;
  if (ymd < nowYmd) return false;
  return sh > ch || (sh === ch && sm > cmin);
}

/**
 * Next Saturday in Stockholm where 18:00–19:00 is still in the future.
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
    if (!isSlotStartInFuture(date, startTime, now)) continue;
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

/** API `interval` for POST /api/my/bookings (minute ISO). */
function bookingInterval(): string {
  const [shRaw, smRaw] = bookingStartTime.split(":");
  const [ehRaw, emRaw] = bookingEndTime.split(":");
  const sh = `${shRaw!.padStart(2, "0")}:${smRaw}`;
  const eh = `${ehRaw!.padStart(2, "0")}:${emRaw}`;
  return `${bookingDate}T${sh}/${eh}`;
}

describe.skipIf(!token).sequential("e2e TimeEdit lifecycle", () => {
  const authHeader = { Authorization: `Bearer ${token}` };

  test("GET /api/bookings returns self-described rooms with bookings", async () => {
    const roomsRes = await app.request("/api/rooms", { headers: authHeader });
    expect(roomsRes.status).toBe(200);
    const roomList = (await roomsRes.json()) as Array<{ id: string; name: string }>;
    expect(Array.isArray(roomList)).toBe(true);
    const listedIds = roomList.map((r) => r.id);
    expect(listedIds.length).toBeGreaterThan(0);

    const res = await app.request("/api/bookings", { headers: authHeader });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      bookingRules: string;
      rooms: Array<{ id: string; bookings: Array<{ interval: string }> }>;
      errors?: unknown[];
    };
    expect(data.bookingRules.length).toBeGreaterThan(20);
    expect(data.rooms.length).toBe(listedIds.length);
    for (const id of listedIds) {
      const row = data.rooms.find((r) => r.id === id);
      expect(row).toBeDefined();
      for (const b of row!.bookings) {
        expect(b.interval).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\//);
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
    expect(data.rooms.map((r) => r.id)).toEqual([testRoomId]);
  });

  test("GET /api/rooms returns array with id on each room", async () => {
    const res = await app.request("/api/rooms", { headers: authHeader });
    expect(res.status).toBe(200);
    const rooms = (await res.json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(rooms)).toBe(true);
    expect(rooms.length).toBeGreaterThan(0);
    const first = rooms[0]!;
    expect(first.id).toMatch(/^\d+$/);
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
        interval: bookingInterval(),
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
      interval: string;
      roomId: string;
    }>;
    const row = list.find((b) => b.id === reservationId);
    expect(row).toBeDefined();
    expect(row!.roomId).toBe(testRoomId);
    expect(row!.interval).toBe(bookingInterval());
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
