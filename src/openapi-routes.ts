import { createRoute, z } from "@hono/zod-openapi";
import {
  AllBookingsQuerySchema,
  AllRoomsBookingsSchema,
  BookingIdParamsSchema,
  MyBookingSchema,
  RoomsListSchema,
  cancelSuccessSchema,
  createBookingSchema,
  gatewayErrorSchema,
  loginFailedSchema,
  loginRequestSchema,
  loginSuccessSchema,
  reservationCreatedSchema,
  unauthorizedSchema,
  validationErrorSchema,
} from "./schemas.js";

const bearerSecurity = [{ Bearer: [] }];

export const loginRoute = createRoute({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  summary: "Log in (Chalmers SSO)",
  description:
    "Stateless login via Chalmers ADFS: returns a TimeEdit JWT. The server exchanges it once for a session cookie on success. Use the token as `Authorization: Bearer <token>` on all other `/api/*` endpoints.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: loginRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "JWT issued; safe to use as Bearer token",
      content: { "application/json": { schema: loginSuccessSchema } },
    },
    400: {
      description: "Invalid or missing JSON body / fields",
      content: {
        "application/json": {
          schema: validationErrorSchema,
        },
      },
    },
    401: {
      description: "SSO rejected credentials or upstream flow failed",
      content: { "application/json": { schema: loginFailedSchema } },
    },
  },
});

export const listRoomsRoute = createRoute({
  method: "get",
  path: "/api/rooms",
  security: bearerSecurity,
  tags: ["Rooms"],
  summary: "List group rooms",
  description:
    "Returns bookable group rooms (Grupprum) for Chalmers TimeEdit as a JSON array; each object includes `id`, `name`, capacity, equipment, and campus. Requires a valid TimeEdit JWT. All datetimes elsewhere in this API use nominal Europe/Stockholm wall time.",
  responses: {
    200: {
      description: "Rooms available for student booking",
      content: { "application/json": { schema: RoomsListSchema } },
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
    "Loads the same group-room list as GET /api/rooms, applies optional filters, then returns a `rooms` array: each entry is a full room plus `bookings` (`interval`, optional `id`, optional `label`). `weekOffset` is query-only (not repeated in the body).",
  request: {
    query: AllBookingsQuerySchema,
  },
  responses: {
    200: {
      description: "Booking rules (shared) plus `rooms` with per-room bookings; optional per-room errors",
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
      content: { "application/json": { schema: z.array(MyBookingSchema) } },
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
