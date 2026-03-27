import { createMiddleware } from "hono/factory";
import { exchangeJwtForSessionCookie } from "../timeedit.js";

export type AuthVars = {
  sessionCookie: string;
};

/**
 * Reads Authorization: Bearer <jwt>, exchanges for TimeEdit TEchalmersweb cookie.
 */
export const requireTimeEditAuth = createMiddleware<{ Variables: AuthVars }>(
  async (c, next) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header (Bearer token required)" }, 401);
    }
    const jwt = auth.slice("Bearer ".length).trim();
    if (!jwt) {
      return c.json({ error: "Empty bearer token" }, 401);
    }

    try {
      const sessionCookie = await exchangeJwtForSessionCookie(jwt);
      c.set("sessionCookie", sessionCookie);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: "TimeEdit authentication failed", detail: message }, 502);
    }

    await next();
  }
);
