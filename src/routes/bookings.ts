import type { Context } from "hono";
import type { AuthVars } from "../middleware/auth.js";
import { parseMyBookingsHtml } from "../parsers.js";
import {
  cancelBooking,
  dateToCompact,
  fetchCsrfToken,
  fetchMyBookingsHtml,
  submitBooking,
} from "../timeedit.js";
import type { CreateBookingInput } from "../schemas.js";
import { createBookingSchema } from "../schemas.js";

export async function listBookingsHandler(c: Context<{ Variables: AuthVars }>) {
  const sessionCookie = c.get("sessionCookie");
  try {
    const html = await fetchMyBookingsHtml(sessionCookie);
    const bookings = parseMyBookingsHtml(html);
    return c.json(bookings, 200);
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
  try {
    const csrf = await fetchCsrfToken(sessionCookie);
    const reservationId = await submitBooking(sessionCookie, csrf, {
      roomId: input.roomId,
      datesCompact: dateToCompact(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
      title: input.title,
      comment: input.comment,
    });
    return c.json({ reservationId }, 200);
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
