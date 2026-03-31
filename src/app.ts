import { Hono } from "hono";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, type RouteHandler } from "@hono/zod-openapi";
import { requireTimeEditAuth, type AuthVars } from "./middleware/auth.js";
import {
  allRoomBookingsRoute,
  createMyBookingRoute,
  deleteMyBookingRoute,
  listMyBookingsRoute,
  listRoomsRoute,
  loginRoute,
} from "./openapi-routes.js";
import {
  allRoomBookingsHandler,
  createBookingFromInput,
  deleteBookingById,
  listBookingsHandler,
  listRoomsHandler,
} from "./routes/index.js";
import { loginHandler } from "./routes/auth.js";

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
    "TimeEdit `teauthtoken` JWT. Obtain one via `POST /api/auth/login`, then send it as `Authorization: Bearer <token>` on every protected API request.",
});

app.use("*", cors());

app.use("/api/*", async (c, next) => {
  if (c.req.method === "POST" && new URL(c.req.url).pathname === "/api/auth/login") {
    return next();
  }
  return requireTimeEditAuth(c, next);
});

app.openapi(
  loginRoute,
  ((c) => {
    const json = c.req.valid("json");
    return loginHandler(c, json);
  }) as RouteHandler<typeof loginRoute, { Variables: AuthVars }>
);

app.openapi(listRoomsRoute, ((c) => listRoomsHandler(c)) as RouteHandler<
  typeof listRoomsRoute,
  { Variables: AuthVars }
>);

const allRoomBookingsOpenApiHandler: RouteHandler<
  typeof allRoomBookingsRoute,
  { Variables: AuthVars }
> = (c) => {
  const q = c.req.valid("query");
  return allRoomBookingsHandler(c, q);
};
app.openapi(allRoomBookingsRoute, allRoomBookingsOpenApiHandler);

app.openapi(listMyBookingsRoute, ((c) => listBookingsHandler(c)) as RouteHandler<
  typeof listMyBookingsRoute,
  { Variables: AuthVars }
>);

const createMyBookingOpenApiHandler: RouteHandler<
  typeof createMyBookingRoute,
  { Variables: AuthVars }
> = (c) => {
  const body = c.req.valid("json");
  return createBookingFromInput(c, body);
};
app.openapi(createMyBookingRoute, createMyBookingOpenApiHandler);

const deleteMyBookingOpenApiHandler: RouteHandler<
  typeof deleteMyBookingRoute,
  { Variables: AuthVars }
> = (c) => {
  const { id } = c.req.valid("param");
  return deleteBookingById(c, id);
};
app.openapi(deleteMyBookingRoute, deleteMyBookingOpenApiHandler);

app.doc31("/openapi", {
  openapi: "3.1.0",
  info: {
    title: "TimeEdit API Wrapper",
    version: "2.0.0",
    description:
      "Stateless Chalmers group-room wrapper over TimeEdit. Obtain a token with `POST /api/auth/login`, then send `Authorization: Bearer <token>` on protected routes. **Breaking (2.0):** naive minute ISO (`YYYY-MM-DDTHH:mm`), interval strings in responses; create uses `interval` instead of separate date/times. All wall times are nominal **Europe/Stockholm**.",
  },
  tags: [
    {
      name: "Auth",
      description:
        "Chalmers SSO login; returns a TimeEdit JWT for `Authorization: Bearer` on other `/api/*` endpoints",
    },
    {
      name: "Rooms",
      description: "Room catalog and week grids: self-described room objects with embedded busy slots",
    },
    {
      name: "My bookings",
      description: "List, create, and cancel your TimeEdit reservations",
    },
  ],
});

app.get(
  "/swagger",
  swaggerUI({
    url: "/openapi",
    docExpansion: "list",
    /** Keeps nested models as collapsible refs in the docs instead of one huge inline tree. */
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
  })
);

app.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    service: "timeedit-api-wrapper",
    docs: `${origin}/swagger`,
    openapi: `${origin}/openapi`,
  });
});

export { app };
export default app;
