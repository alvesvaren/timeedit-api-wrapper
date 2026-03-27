/**
 * OpenAPI-first domain entities and shared building blocks (intervals, room refs).
 * Composed route/response schemas live in `schemas.ts`.
 */
import { z } from "@hono/zod-openapi";

/** Naive local wall time as used by TimeEdit (`YYYY-MM-DDTHH:mm:ss`, no timezone offset). */
export const NaiveLocalDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  .openapi({
    type: "string",
    format: "date-time",
    description:
      "Naive local wall-clock datetime (no `Z` or offset), same convention as the TimeEdit week grid.",
    example: "2026-03-28T11:15:00",
  });

/** Shared interval shape for any booked or busy slot. */
export const BookingIntervalSchema = z
  .object({
    start: NaiveLocalDateTimeSchema,
    end: NaiveLocalDateTimeSchema,
  })
  .openapi("BookingInterval");

export type BookingInterval = z.infer<typeof BookingIntervalSchema>;

/** Room identity when only id and/or name are relevant (subset of {@link RoomSchema}). */
export const RoomRefSchema = z
  .object({
    id: z.string().optional().openapi({ example: "485" }),
    name: z.string().openapi({ example: "KG34" }),
  })
  .openapi("RoomRef");

export type RoomRef = z.infer<typeof RoomRefSchema>;

export const RoomSchema = z
  .object({
    id: z.string().openapi({ example: "485" }),
    name: z.string().openapi({ example: "KG34" }),
    capacity: z.number().nullable().openapi({ example: 8 }),
    equipment: z.string().openapi({ example: "Whiteboard" }),
    campus: z.string().openapi({ example: "Johanneberg" }),
  })
  .openapi("Room");

export type Room = z.infer<typeof RoomSchema>;

/**
 * Your reservation from my bookings (same `start`/`end` convention as {@link RoomCalendarSlotSchema}).
 */
export const BookingSchema = BookingIntervalSchema.extend({
  id: z.string().openapi({ example: "182700", description: "TimeEdit reservation id" }),
  room: RoomRefSchema,
  createdAt: z.string().openapi({
    example: "2026-03-27 13:36",
    description: "As returned by TimeEdit (human-readable; not normalized).",
  }),
}).openapi("Booking");

export type Booking = z.infer<typeof BookingSchema>;

/**
 * A busy block on a room week grid from TimeEdit (not necessarily your booking).
 */
export const RoomCalendarSlotSchema = BookingIntervalSchema.extend({
  reservationId: z.string().optional().openapi({ example: "174803" }),
  label: z.string().optional().openapi({ example: "Övrigt" }),
}).openapi("RoomCalendarSlot");

export type RoomCalendarSlot = z.infer<typeof RoomCalendarSlotSchema>;

/** Response body for POST create — full {@link Booking} is not available without refetching. */
export const CreatedBookingSchema = z
  .object({
    id: z.string().openapi({ example: "182700", description: "TimeEdit reservation id" }),
  })
  .openapi("CreatedBooking");

export type CreatedBooking = z.infer<typeof CreatedBookingSchema>;

export const ReservationCreatedSchema = z
  .object({
    booking: CreatedBookingSchema,
  })
  .openapi("ReservationCreated");
