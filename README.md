# TimeEdit API wrapper

A small **stateless** HTTP service for Chalmers student-facing **TimeEdit Cloud** (`cloud.timeedit.net`). The API is **reverse engineered** from how the web UI talks to TimeEdit: it calls TimeEdit’s own endpoints and parses the same HTML/JSON where needed, then exposes a **simpler JSON API** for consumers (rooms, weekly busy grids, and your own reservations).

Nothing is stored on disk; each request uses the TimeEdit JWT you send, which the server exchanges for a short-lived session cookie the same way the browser does.

## How to use

**Interactive docs:** start the server and open **Swagger UI** at [`/swagger`](http://localhost:3000/swagger). The OpenAPI spec is at [`/openapi`](http://localhost:3000/openapi). Use those for paths, schemas, and query parameters.

### Authenticate

Log in with your Chalmers credentials; the response contains a TimeEdit JWT (`token`).

```bash
curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"cid@chalmers.se","password":"your-password"}'
```

### Call the API

Send the JWT on protected routes:

```http
Authorization: Bearer <token>
```

Example:

```bash
TOKEN='<paste token from login response>'

curl -sS http://localhost:3000/api/rooms \
  -H "Authorization: Bearer $TOKEN"
```

Treat the token like a session secret and use HTTPS in front of the service in any real deployment.

## Development

**Requirements:** Node.js (LTS), **pnpm** (version in `package.json` → `packageManager`).

```bash
pnpm install
pnpm dev          # default port 3000; override with PORT=8080
pnpm build && pnpm start   # production-style
pnpm test
```

**Layout (high level):**

| Area | Role |
| --- | --- |
| `src/index.ts` | Server entry, `PORT` from env |
| `src/app.ts` | Hono app, OpenAPI doc, Swagger UI, route wiring |
| `src/openapi-routes.ts` | OpenAPI routes and Zod schemas |
| `src/timeedit.ts` | Low-level TimeEdit HTTP (cookies, CSRF, upstream calls) |
| `src/routes/` | Handlers (auth, rooms, bookings, schedules) |
| `src/middleware/auth.ts` | Bearer JWT → session cookie |
| `src/parsers/` | HTML parsing for schedules and “my bookings” |

End-to-end tests in `src/tests/e2e.test.ts` hit the real TimeEdit backend; they are skipped unless you set `TIMEEDIT_TOKEN` (see that file / `pnpm test:e2e`).

---

**AI / maintenance disclaimer:** This project was largely **vibe-coded** with AI assistance. Do **not** rely on it for anything important without **testing and verifying** behaviour yourself—especially login flows, upstream HTML shapes, and Chalmers/TimeEdit changes that can break parsers or SSO without warning.
