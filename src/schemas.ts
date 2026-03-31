/**
 * API request/response and query Zod schemas, composed from {@link ./entities.js}.
 */
import { z } from "@hono/zod-openapi";
import {
  ReservationCreatedSchema,
  ReservationSlotSchema,
  RoomAttributesSchema,
  RoomSchema,
} from "./entities.js";

export {
  BookingIntervalSchema,
  CreatedBookingSchema,
  MyBookingSchema,
  NaiveLocalDateTimeSchema,
  NaiveMinuteDateTimeSchema,
  ReservationCreatedSchema,
  ReservationSlotSchema,
  RoomAttributesSchema,
  RoomCalendarSlotSchema,
  RoomSchema,
} from "./entities.js";

export type {
  BookingInterval,
  CreatedBooking,
  MyBooking,
  ReservationSlot,
  Room,
  RoomAttributes,
  RoomCalendarSlot,
} from "./entities.js";

export const reservationCreatedSchema = ReservationCreatedSchema;

export const createBookingSchema = z
  .object({
    roomId: z.string().min(1).openapi({ example: "485" }),
    interval: z
      .string()
      .min(1)
      .openapi({
        example: "2026-03-28T18:00/19:00",
        description:
          "ISO-style interval in Europe/Stockholm: `YYYY-MM-DDTHH:mm/end` where `end` is `HH:mm`, full `YYYY-MM-DDTHH:mm`, or `PT…` duration (e.g. `PT1H`). Must align to 15-minute grid; must not cross local midnight.",
      }),
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

const CHALMERS_CID_DOMAIN = "chalmers.se";

export function normalizeLoginUsername(username: string): string {
  if (!username.includes("@")) {
    return `${username}@${CHALMERS_CID_DOMAIN}`;
  }
  return username;
}

export const loginRequestSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(1)
      .transform(normalizeLoginUsername)
      .openapi({ example: "cid@chalmers.se" }),
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

export const RoomBookingsFetchErrorSchema = z
  .object({
    roomId: z.string(),
    detail: z.string(),
  })
  .openapi("RoomBookingsFetchError");

export const RoomsListSchema = z.array(RoomSchema).openapi("RoomsList", {
  description: "Bookable group rooms; each entry includes `id`, `name`, capacity, equipment, and campus.",
});

export const RoomWithReservationsSchema = RoomSchema.extend({
  bookings: z.array(ReservationSlotSchema),
}).openapi("RoomWithReservations", {
  description: "One room's metadata plus that room's busy slots for the requested week.",
});

export const AllRoomsBookingsSchema = z
  .object({
    bookingRules: z.string(),
    rooms: z.array(RoomWithReservationsSchema),
    errors: z
      .array(RoomBookingsFetchErrorSchema)
      .optional()
      .openapi({
        description:
          "Per-room upstream/parse failures (other entries in `rooms` may still be present).",
      }),
  })
  .openapi("AllRoomsBookings", {
    description:
      "Week grid: shared booking rules and a `rooms` array (each room self-described with `bookings`). No `weekOffset` in body (query only).",
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
