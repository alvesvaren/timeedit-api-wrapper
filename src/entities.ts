/**
 * OpenAPI-first domain entities. Parser-facing slot types use second precision;
 * API responses use minute ISO and interval strings (see {@link ./schemas.js}).
 */
import { z } from "@hono/zod-openapi";

/** Naive local wall time as returned by parsers (`YYYY-MM-DDTHH:mm:ss`). */
export const NaiveLocalDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  .openapi({
    type: "string",
    format: "date-time",
    description:
      "Internal naive wall-clock datetime from TimeEdit HTML (second precision). Not used in public JSON responses.",
    example: "2026-03-28T11:15:00",
  });

/** Naive minute wall time in public API (`YYYY-MM-DDTHH:mm`). Nominal zone: Europe/Stockholm. */
export const NaiveMinuteDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .openapi({
    type: "string",
    format: "date-time",
    description:
      "Naive local minute datetime. Semantics: Europe/Stockholm (TimeEdit) wall time — not a UTC instant.",
    example: "2026-03-28T11:15",
  });

/** Shared interval shape for parser slot building blocks. */
export const BookingIntervalSchema = z
  .object({
    start: NaiveLocalDateTimeSchema,
    end: NaiveLocalDateTimeSchema,
  })
  .openapi("BookingInterval");

export type BookingInterval = z.infer<typeof BookingIntervalSchema>;

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

/** Room fields without `id` (subset for reuse). */
export const RoomAttributesSchema = RoomSchema.omit({ id: true }).openapi("RoomAttributes");

export type RoomAttributes = z.infer<typeof RoomAttributesSchema>;

/**
 * Week grid busy slot in API responses: ISO-style interval string plus optional metadata.
 * Interval: `YYYY-MM-DDTHH:mm/HH:mm` or `YYYY-MM-DDTHH:mm/YYYY-MM-DDTHH:mm`.
 */
export const ReservationSlotSchema = z
  .object({
    interval: z.string().openapi({
      example: "2026-03-31T09:15/11:15",
      description:
        "Local naive minute interval: `start/end` separated by `/`. End may be `HH:mm` when same calendar day.",
    }),
    id: z.string().optional().openapi({ example: "174803", description: "TimeEdit reservation id when known" }),
    label: z.string().optional().openapi({ example: "Övrigt" }),
  })
  .openapi("ReservationSlot");

export type ReservationSlot = z.infer<typeof ReservationSlotSchema>;

/** One row from `GET /api/my/bookings`. */
export const MyBookingSchema = z
  .object({
    id: z.string().openapi({ example: "182700", description: "TimeEdit reservation id" }),
    interval: z.string().openapi({
      example: "2026-03-28T11:15/12:15",
      description: "Same interval format as week-grid slots.",
    }),
    roomId: z.string().openapi({ example: "485" }),
    createdAt: NaiveMinuteDateTimeSchema,
    label: z.string().optional(),
  })
  .openapi("MyBooking");

export type MyBooking = z.infer<typeof MyBookingSchema>;

/**
 * A busy block from the room week grid parser (not necessarily your booking).
 */
export const RoomCalendarSlotSchema = BookingIntervalSchema.extend({
  reservationId: z.string().optional().openapi({ example: "174803" }),
  label: z.string().optional().openapi({ example: "Övrigt" }),
}).openapi("RoomCalendarSlot");

export type RoomCalendarSlot = z.infer<typeof RoomCalendarSlotSchema>;

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
