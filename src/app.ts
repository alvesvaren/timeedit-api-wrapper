import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, type RouteHandler } from "@hono/zod-openapi";
import { requireTimeEditAuth, type AuthVars } from "./middleware/auth.js";
import {
  createBookingRoute,
  deleteBookingRoute,
  listBookingsRoute,
  listRoomsRoute,
  roomAvailabilityRoute,
  roomScheduleRoute,
} from "./openapi-routes.js";
import {
  createBookingFromInput,
  deleteBookingById,
  listBookingsHandler,
  listRoomsHandler,
  roomAvailabilityFromQuery,
  roomScheduleHandler,
} from "./routes/index.js";

const app = new OpenAPIHono<{ Variables: AuthVars }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Validation failed",
          issues: {
            formErrors: result.error.flatten().formErrors,
            fieldErrors: result.error.flatten().fieldErrors,
          },
        },
        400
      );
    }
  },
});

app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "TimeEdit `teauthtoken` JWT (same as used by cloud.timeedit.net after login). Exchanged server-side for a session cookie; not stored.",
});

app.use("/api/*", requireTimeEditAuth);

app.openapi(listRoomsRoute, ((c) => listRoomsHandler(c)) as RouteHandler<
  typeof listRoomsRoute,
  { Variables: AuthVars }
>);

const roomScheduleOpenApiHandler: RouteHandler<
  typeof roomScheduleRoute,
  { Variables: AuthVars }
> = (c) => {
  const { roomId } = c.req.valid("param");
  const { weekOffset } = c.req.valid("query");
  return roomScheduleHandler(c, roomId, weekOffset);
};
app.openapi(roomScheduleRoute, roomScheduleOpenApiHandler);

const roomAvailabilityOpenApiHandler: RouteHandler<
  typeof roomAvailabilityRoute,
  { Variables: AuthVars }
> = (c) => {
  const { roomId } = c.req.valid("param");
  const q = c.req.valid("query");
  return roomAvailabilityFromQuery(c, roomId, q);
};
app.openapi(roomAvailabilityRoute, roomAvailabilityOpenApiHandler);

app.openapi(listBookingsRoute, ((c) => listBookingsHandler(c)) as RouteHandler<
  typeof listBookingsRoute,
  { Variables: AuthVars }
>);

const createBookingOpenApiHandler: RouteHandler<
  typeof createBookingRoute,
  { Variables: AuthVars }
> = (c) => {
  const body = c.req.valid("json");
  return createBookingFromInput(c, body);
};
app.openapi(createBookingRoute, createBookingOpenApiHandler);

const deleteBookingOpenApiHandler: RouteHandler<
  typeof deleteBookingRoute,
  { Variables: AuthVars }
> = (c) => {
  const { id } = c.req.valid("param");
  return deleteBookingById(c, id);
};
app.openapi(deleteBookingRoute, deleteBookingOpenApiHandler);

app.doc31("/openapi", {
  openapi: "3.1.0",
  info: {
    title: "TimeEdit API Wrapper",
    version: "1.0.0",
    description:
      "Stateless Chalmers group-room wrapper over TimeEdit. Send `Authorization: Bearer <your TimeEdit JWT>` on every request.",
  },
  tags: [
    {
      name: "Rooms",
      description: "List rooms, week schedules (busy times), and slot availability",
    },
    { name: "Bookings", description: "List, create, and cancel reservations" },
  ],
});

app.get("/swagger", swaggerUI({ url: "/openapi" }));

app.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    service: "timeedit-api-wrapper",
    swagger: `${origin}/swagger`,
    openApiJson: `${origin}/openapi`,
    note: "All /api/* routes require Authorization: Bearer <TimeEdit JWT>",
    endpoints: [
      "GET /api/rooms",
      "GET /api/rooms/{roomId}/schedule",
      "GET /api/rooms/{roomId}/availability",
      "GET/POST /api/bookings",
      "DELETE /api/bookings/{id}",
    ],
  });
});

export { app };
