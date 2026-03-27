import { z } from "@hono/zod-openapi";

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

export const BookingSchema = z
  .object({
    id: z.string().openapi({ example: "182700" }),
    date: z.string().openapi({ example: "2026-03-28" }),
    startTime: z.string().openapi({ example: "11:15" }),
    endTime: z.string().openapi({ example: "12:15" }),
    roomName: z.string().openapi({ example: "KG34" }),
    createdAt: z.string().openapi({ example: "2026-03-27 13:36" }),
  })
  .openapi("Booking");

export type Booking = z.infer<typeof BookingSchema>;

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

export const reservationCreatedSchema = z
  .object({
    reservationId: z.string().openapi({ example: "182700" }),
  })
  .openapi("ReservationCreated");

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

export const BookingIdParamsSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      example: "182700",
    }),
});

export const ScheduleBookingSchema = z
  .object({
    start: z
      .string()
      .openapi({
        format: "date-time",
        example: "2026-03-23T08:00:00",
        description:
          "Interval start (naive local wall time, `YYYY-MM-DDTHH:mm:ss`, same timezone as TimeEdit).",
      }),
    end: z
      .string()
      .openapi({
        format: "date-time",
        example: "2026-03-23T10:00:00",
        description: "Interval end (same format as `start`; half-open semantics match the grid).",
      }),
    reservationId: z.string().optional().openapi({ example: "174803" }),
    label: z.string().optional().openapi({ example: "Övrigt" }),
  })
  .openapi("ScheduleBooking");

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

export const RoomWithScheduleSchema = RoomSchema.extend({
  bookings: z.array(ScheduleBookingSchema),
}).openapi("RoomWithSchedule");

export const ScheduleFetchErrorSchema = z
  .object({
    roomId: z.string(),
    detail: z.string(),
  })
  .openapi("ScheduleFetchError");

export const AllRoomSchedulesSchema = z
  .object({
    weekOffset: z.number().openapi({ example: 0 }),
    bookingRules: z.string(),
    filters: z
      .object({
        campus: z.string().optional(),
        q: z.string().optional(),
        roomIds: z.array(z.string()).optional(),
      })
      .openapi({
        description: "Normalized filters applied (subset may be omitted if unused).",
      }),
    rooms: z.array(RoomWithScheduleSchema),
    errors: z
      .array(ScheduleFetchErrorSchema)
      .optional()
      .openapi({
        description:
          "Per-room upstream/parse failures (other rooms in `rooms` are still returned).",
      }),
  })
  .openapi("AllRoomSchedules");

export type AllRoomSchedulesResponse = z.infer<typeof AllRoomSchedulesSchema>;

export const AllSchedulesQuerySchema = z.object({
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
        "Optional comma-separated TimeEdit room ids; result is intersected with filters (order follows the room list).",
    }),
});
