import { describe, expect, test } from "vitest";
import { app } from "../app.js";

const token = process.env.TIMEEDIT_TOKEN;
/** Room numeric id (objects.json id), e.g. "485" for KG34 */
const testRoomId = process.env.E2E_ROOM_ID ?? "485";
/**
 * ISO date YYYY-MM-DD for booking test (should be a day you can book, slot should be free).
 * Default: day after tomorrow in local time.
 */
function defaultBookingDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const bookingDate = process.env.E2E_BOOKING_DATE ?? defaultBookingDate();

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
        startTime: "07:15",
        endTime: "08:15",
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
    expect(row!.start).toBe(`${bookingDate}T07:15:00`);
    expect(row!.end).toBe(`${bookingDate}T08:15:00`);
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
