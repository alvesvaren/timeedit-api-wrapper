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

  test("POST /api/bookings creates a booking", async () => {
    const res = await app.request("/api/bookings", {
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
    const data = (await res.json()) as { reservationId?: string };
    expect(data.reservationId).toBeDefined();
    reservationId = data.reservationId!;
  });

  test("GET /api/bookings includes new booking", async () => {
    const res = await app.request("/api/bookings", { headers: authHeader });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.some((b) => b.id === reservationId)).toBe(true);
  });

  test("DELETE /api/bookings/:id cancels", async () => {
    const res = await app.request(`/api/bookings/${reservationId}`, {
      method: "DELETE",
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success?: boolean };
    expect(data.success).toBe(true);
  });

  test("GET /api/bookings no longer lists cancelled booking", async () => {
    const res = await app.request("/api/bookings", { headers: authHeader });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.some((b) => b.id === reservationId)).toBe(false);
  });
});

describe("auth required", () => {
  test("GET /api/rooms without token returns 401", async () => {
    const res = await app.request("/api/rooms");
    expect(res.status).toBe(401);
  });
});
