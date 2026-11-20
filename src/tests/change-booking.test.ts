import { afterEach, describe, expect, test, vi } from "vitest";
import { app } from "../app.js";

const CSRF_TOKEN = "12345";
const RESERVATION_ID = "326368";

type TimeEditReply = { status: number; body: string };

/** Fakes the TimeEdit endpoints a booking change touches and records the change request body. */
function fakeTimeEdit(changeReply: TimeEditReply) {
  const changeBodies: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = new URLSearchParams(String(init?.body ?? ""));
      if (url.pathname === "/chalmers/web") {
        return new Response(null, {
          status: 302,
          headers: { "Set-Cookie": "TEchalmersweb=session; Path=/" },
        });
      }
      if (body.get("CSTTG") === "gen") {
        return new Response(CSRF_TOKEN);
      }
      if (url.pathname.endsWith("/my.html") && body.get("ef") === "3") {
        changeBodies.push(body);
        return new Response(changeReply.body, { status: changeReply.status });
      }
      throw new Error(`Unexpected TimeEdit request: ${init?.method} ${url}`);
    })
  );
  return changeBodies;
}

function patchBooking(id: string, interval: string) {
  return app.request(`/api/my/bookings/${id}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" },
    body: JSON.stringify({ interval }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PATCH /api/my/bookings/:id", () => {
  test("sends the new date and time to TimeEdit", async () => {
    const changeBodies = fakeTimeEdit({
      status: 200,
      body: `https://cloud.timeedit.net/chalmers/web/student/my.html?h=t&sid=8&id=${RESERVATION_ID}&ef=0`,
    });

    const res = await patchBooking(RESERVATION_ID, "2026-12-01T07:00/09:00");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ booking: { id: RESERVATION_ID } });
    expect(changeBodies.map((b) => Object.fromEntries(b))).toEqual([
      { ef: "3", t: "07.00,09.00", dates: "20261201", CSTT: CSRF_TOKEN },
    ]);
  });

  test("returns 409 with TimeEdit's reason when the change is rejected", async () => {
    const reason =
      "Bokningen kunde ej genomföras.  Tiden är upptagen eftersom objektet SB-G213 redan är bokat #326368";
    fakeTimeEdit({ status: 409, body: reason });

    const res = await patchBooking(RESERVATION_ID, "2026-12-01T08:00/10:00");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Change rejected by TimeEdit", detail: reason });
  });

  test("returns 404 when TimeEdit has no such reservation", async () => {
    fakeTimeEdit({ status: 400, body: "Time: No reservations found with ids: [1]" });

    const res = await patchBooking("1", "2026-12-01T08:00/09:00");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Booking not found",
      detail: "Time: No reservations found with ids: [1]",
    });
  });

  test("returns 502 on an unknown TimeEdit failure", async () => {
    fakeTimeEdit({ status: 500, body: "Internal error" });

    const res = await patchBooking(RESERVATION_ID, "2026-12-01T08:00/09:00");

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Change failed",
      detail: "TimeEdit change failed: 500 Internal error",
    });
  });
});
