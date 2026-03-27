import { createRoute, z } from "@hono/zod-openapi";
import {
  AllBookingsQuerySchema,
  AllRoomsBookingsSchema,
  BookingIdParamsSchema,
  BookingSchema,
  RoomSchema,
  cancelSuccessSchema,
  createBookingSchema,
  gatewayErrorSchema,
  reservationCreatedSchema,
  unauthorizedSchema,
  validationErrorSchema,
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

export const allRoomBookingsRoute = createRoute({
  method: "get",
  path: "/api/bookings",
  security: bearerSecurity,
  tags: ["Rooms"],
  summary: "Week booking grids for all rooms",
  description:
    "Loads the same group-room list as GET /api/rooms, applies optional filters (campus, name substring, explicit ids), then returns flat `bookings` (ISO local start/end per busy slot) for every matching room. Each room uses its own TimeEdit `ri.html` request. Fetches run concurrently in small batches server-side.",
  request: {
    query: AllBookingsQuerySchema,
  },
  responses: {
    200: {
      description: "Booking rules (shared) plus busy intervals per room; optional per-room errors",
      content: { "application/json": { schema: AllRoomsBookingsSchema } },
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

export const listMyBookingsRoute = createRoute({
  method: "get",
  path: "/api/my/bookings",
  security: bearerSecurity,
  tags: ["My bookings"],
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

export const createMyBookingRoute = createRoute({
  method: "post",
  path: "/api/my/bookings",
  security: bearerSecurity,
  tags: ["My bookings"],
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
      description: "Created booking; `booking.id` is the TimeEdit reservation id",
      content: { "application/json": { schema: reservationCreatedSchema } },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: validationErrorSchema,
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

export const deleteMyBookingRoute = createRoute({
  method: "delete",
  path: "/api/my/bookings/{id}",
  security: bearerSecurity,
  tags: ["My bookings"],
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
