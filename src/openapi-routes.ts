import { createRoute, z } from "@hono/zod-openapi";
import {
  AvailabilityQuerySchema,
  BookingIdParamsSchema,
  BookingSchema,
  RoomAvailabilitySchema,
  RoomIdParamsSchema,
  RoomSchema,
  RoomWeekScheduleSchema,
  ScheduleQuerySchema,
  cancelSuccessSchema,
  createBookingSchema,
  gatewayErrorSchema,
  reservationCreatedSchema,
  unauthorizedSchema,
} from "./schemas.js";

const bearerSecurity = [{ Bearer: [] }];

export const listRoomsRoute = createRoute({
  method: "get",
  path: "/api/rooms",
  security: bearerSecurity,
  tags: ["Rooms"],
  summary: "List group rooms",
  description:
    "Returns bookable group rooms (Grupprum) for Chalmers TimeEdit. Requires a valid TimeEdit JWT.",
  responses: {
    200: {
      description: "Rooms available for student booking",
      content: { "application/json": { schema: z.array(RoomSchema) } },
    },
    401: {
      description: "Missing or invalid Authorization header",
      content: { "application/json": { schema: unauthorizedSchema } },
    },
    502: {
      description: "Upstream TimeEdit or network error",
      content: { "application/json": { schema: gatewayErrorSchema } },
    },
  },
});

export const roomScheduleRoute = createRoute({
  method: "get",
  path: "/api/rooms/{roomId}/schedule",
  security: bearerSecurity,
  tags: ["Rooms"],
  summary: "Week grid (busy intervals)",
  description:
    "Loads the weekly schedule for a single room, parses booked blocks per day, and returns institutional booking rules text. Use `weekOffset` to navigate weeks (0 = current, 1 = next, -1 = previous, etc.).",
  request: {
    params: RoomIdParamsSchema,
    query: ScheduleQuerySchema,
  },
  responses: {
    200: {
      description: "Booking policy text plus busy intervals per date",
      content: { "application/json": { schema: RoomWeekScheduleSchema } },
    },
    401: {
      description: "Missing or invalid Authorization header",
      content: { "application/json": { schema: unauthorizedSchema } },
    },
    502: {
      description: "TimeEdit or parse error",
      content: { "application/json": { schema: gatewayErrorSchema } },
    },
  },
});

export const roomAvailabilityRoute = createRoute({
  method: "get",
  path: "/api/rooms/{roomId}/availability",
  security: bearerSecurity,
  tags: ["Rooms"],
  summary: "Check if a slot is free",
  description:
    "Uses the same week grid as `schedule` and tests overlap with existing bookings. If `dateInLoadedWeek` is false, the date is outside the returned week—call `schedule` and pick a listed date.",
  request: {
    params: RoomIdParamsSchema,
    query: AvailabilityQuerySchema,
  },
  responses: {
    200: {
      description: "Availability result and any conflicting bookings",
      content: { "application/json": { schema: RoomAvailabilitySchema } },
    },
    401: {
      description: "Missing or invalid Authorization header",
      content: { "application/json": { schema: unauthorizedSchema } },
    },
    502: {
      description: "TimeEdit or parse error",
      content: { "application/json": { schema: gatewayErrorSchema } },
    },
  },
});

export const listBookingsRoute = createRoute({
  method: "get",
  path: "/api/bookings",
  security: bearerSecurity,
  tags: ["Bookings"],
  summary: "List my bookings",
  responses: {
    200: {
      description: "Current reservations for the authenticated user",
      content: { "application/json": { schema: z.array(BookingSchema) } },
    },
    401: {
      description: "Missing or invalid Authorization header",
      content: { "application/json": { schema: unauthorizedSchema } },
    },
    502: {
      description: "Upstream TimeEdit or network error",
      content: { "application/json": { schema: gatewayErrorSchema } },
    },
  },
});

export const createBookingRoute = createRoute({
  method: "post",
  path: "/api/bookings",
  security: bearerSecurity,
  tags: ["Bookings"],
  summary: "Book a group room",
  request: {
    body: {
      content: {
        "application/json": {
          schema: createBookingSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Reservation created; `reservationId` is the TimeEdit booking id",
      content: { "application/json": { schema: reservationCreatedSchema } },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            issues: z.record(z.string(), z.unknown()).optional(),
          }),
        },
      },
    },
    401: {
      description: "Missing or invalid Authorization header",
      content: { "application/json": { schema: unauthorizedSchema } },
    },
    502: {
      description: "Booking failed at TimeEdit",
      content: { "application/json": { schema: gatewayErrorSchema } },
    },
  },
});

export const deleteBookingRoute = createRoute({
  method: "delete",
  path: "/api/bookings/{id}",
  security: bearerSecurity,
  tags: ["Bookings"],
  summary: "Cancel a booking",
  request: {
    params: BookingIdParamsSchema,
  },
  responses: {
    200: {
      description: "Booking cancelled",
      content: { "application/json": { schema: cancelSuccessSchema } },
    },
    400: {
      description: "Missing booking id",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    401: {
      description: "Missing or invalid Authorization header",
      content: { "application/json": { schema: unauthorizedSchema } },
    },
    502: {
      description: "Cancel failed at TimeEdit",
      content: { "application/json": { schema: gatewayErrorSchema } },
    },
  },
});
