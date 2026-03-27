/**
 * API request/response and query Zod schemas, composed from {@link ./entities.js}.
 */
import { z } from "@hono/zod-openapi";
import {
  ReservationCreatedSchema,
  RoomCalendarSlotSchema,
  RoomSchema,
} from "./entities.js";

export {
  BookingIntervalSchema,
  BookingSchema,
  CreatedBookingSchema,
  NaiveLocalDateTimeSchema,
  ReservationCreatedSchema,
  RoomCalendarSlotSchema,
  RoomRefSchema,
  RoomSchema,
} from "./entities.js";

export type {
  Booking,
  BookingInterval,
  CreatedBooking,
  Room,
  RoomCalendarSlot,
  RoomRef,
} from "./entities.js";

export const reservationCreatedSchema = ReservationCreatedSchema;

export const createBookingSchema = z
  .object({
    roomId: z.string().min(1).openapi({ example: "485" }),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .openapi({ example: "2026-03-28" }),
    startTime: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .openapi({ example: "11:15" }),
    endTime: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .openapi({ example: "12:15" }),
    title: z.string().optional().openapi({ example: "Study session" }),
    comment: z.string().optional().openapi({ example: "" }),
  })
  .openapi("CreateBookingRequest");

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelSuccessSchema = z
  .object({
    success: z.literal(true).openapi({ example: true }),
  })
  .openapi("CancelSuccess");

export const unauthorizedSchema = z
  .object({
    error: z.string().openapi({ example: "Missing or invalid Authorization header" }),
  })
  .openapi("Unauthorized");

export const validationErrorSchema = z
  .object({
    error: z.string(),
    issues: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("ValidationError");

export const gatewayErrorSchema = z
  .object({
    error: z.string(),
    detail: z.string().optional(),
  })
  .openapi("GatewayError");

export const loginRequestSchema = z
  .object({
    username: z.string().trim().min(1).openapi({ example: "cid@chalmers.se" }),
    password: z.string().min(1).openapi({ example: "your-password" }),
  })
  .openapi("LoginRequest");

export type LoginInput = z.infer<typeof loginRequestSchema>;

export const loginSuccessSchema = z
  .object({
    token: z.string().openapi({
      description: "TimeEdit `teauthtoken` JWT. Send as `Authorization: Bearer <token>` on protected `/api/*` routes.",
    }),
  })
  .openapi("LoginSuccess");

export const loginFailedSchema = z
  .object({
    error: z.literal("Login failed"),
    detail: z.string(),
  })
  .openapi("LoginFailed");

export const BookingIdParamsSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      example: "182700",
    }),
});

export const RoomWithBookingsSchema = RoomSchema.extend({
  bookings: z.array(RoomCalendarSlotSchema),
}).openapi("RoomWithBookings");

export const RoomBookingsFetchErrorSchema = z
  .object({
    roomId: z.string(),
    detail: z.string(),
  })
  .openapi("RoomBookingsFetchError");

export const AllRoomsBookingsSchema = z
  .object({
    weekOffset: z.number().openapi({ example: 0 }),
    bookingRules: z.string(),
    rooms: z.array(RoomWithBookingsSchema),
    errors: z
      .array(RoomBookingsFetchErrorSchema)
      .optional()
      .openapi({
        description:
          "Per-room upstream/parse failures (other rooms in `rooms` are still returned).",
      }),
  })
  .openapi("AllRoomsBookings", {
    description:
      "Aggregate week grid. `rooms[]` items are `RoomWithBookings` (`Room` + `RoomCalendarSlot[]`); see components/schemas.",
  });

export type AllRoomsBookingsResponse = z.infer<typeof AllRoomsBookingsSchema>;

export const WeekOffsetQuerySchema = z
  .string()
  .regex(/^-?\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(-6).max(10))
  .optional()
  .default(0)
  .openapi({
    param: { name: "weekOffset", in: "query", required: false },
    type: "string",
    example: "0",
    description: "Week offset: 0 = current, 1 = next, -1 = previous. Range: -6 to +10.",
  });

export const AllBookingsQuerySchema = z.object({
  weekOffset: WeekOffsetQuerySchema,
  campus: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .openapi({
      param: { name: "campus", in: "query", required: false },
      example: "Johanneberg",
      description: "Case-insensitive substring match on `campus` (same field as GET /api/rooms).",
    }),
  q: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .openapi({
      param: { name: "q", in: "query", required: false },
      example: "KG",
      description: "Case-insensitive substring match on room name (`name`).",
    }),
  roomIds: z
    .string()
    .max(4000)
    .optional()
    .transform((s) => {
      if (!s?.trim()) return undefined;
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    })
    .pipe(
      z
        .array(z.string().min(1).regex(/^\d+$/))
        .max(100)
        .optional()
    )
    .openapi({
      param: { name: "roomIds", in: "query", required: false },
      example: "485,486",
      description:
        "Optional comma-separated TimeEdit room ids; combined with campus and q query params (order follows the room list).",
    }),
});
