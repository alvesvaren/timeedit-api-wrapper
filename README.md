# TimeEdit API wrapper

A small stateless HTTP service for Chalmers student-facing **TimeEdit Cloud** (`cloud.timeedit.net`). The API mirrors how the web UI talks to TimeEdit: it calls the same endpoints and parses the same HTML/JSON where needed, then exposes a simpler JSON API for consumers (rooms, weekly busy grids, and your own reservations).

Nothing is stored on disk; each request uses the TimeEdit JWT you send, which the server exchanges for a short-lived session cookie the same way the browser does.

*Disclaimer:* **Unofficial**—not affiliated with TimeEdit or Chalmers. **Use at your own risk;** the maintainers are not responsible for how you use this software or for any consequences (compliance, account issues, outages, data loss, etc.).

## How to use

**Interactive docs:** start the server and open **Swagger UI** at [`/swagger`](https://timeedit.svaren.dev/swagger). The OpenAPI spec is at [`/openapi`](https://timeedit.svaren.dev/openapi). Use those for paths, schemas, and query parameters.

**API 2.x (breaking):** `GET /api/rooms` returns a **JSON array** of rooms (each includes **`id`**). `GET /api/bookings` returns **`rooms`**: the same shape plus **`bookings`** with **`interval`** strings (`YYYY-MM-DDTHH:mm/HH:mm` or full end date when needed); no `weekOffset` in the body. **`POST /api/my/bookings`** expects **`roomId`** plus **`interval`** (end time or `PT…` duration). Wall times are **naive minutes** with nominal **`Europe/Stockholm`** semantics—see OpenAPI for details.

**Hosted version:** this API is hosted by me at vercel and available at https://timeedit.svaren.dev, but as this does get sensitive login information for your entire chalmers account, do consider hosting it yourself!

### Authenticate

Log in with your Chalmers credentials; the response contains a TimeEdit JWT (`token`).

**Why the server sees your password:** TimeEdit is a vendor product and Chalmers SSO is not exposed here as a public OAuth/OIDC client with a TimeEdit-specific scope. Until there is an official app registration for that, this wrapper has to complete the same browser-style SSO flow server-side—so credentials pass through the service. Use **HTTPS** in production, avoid logging request bodies, and do not persist passwords; only keep the returned token (short-lived; re-login when it expires).

```bash
curl -sS -X POST https://timeedit.svaren.dev/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"cid","password":"your-password"}'
```

### Call the API

Send the JWT on protected routes:

```http
Authorization: Bearer <token>
```

Example:

```bash
TOKEN='<paste token from login response>'

curl -sS https://timeedit.svaren.dev/api/rooms \
  -H "Authorization: Bearer $TOKEN"
```

**Bearer token:** Anyone who holds the JWT can act as you on these API routes until the token expires (lifetime is decided by TimeEdit, not this wrapper). Treat it like a password: secure storage on clients, never in URLs or shared logs, and assume compromise means full API access for that account while the token is active—rotate by logging in again when needed (At the time of writing, this is every 24h)

## Development

**Requirements:** Node.js, **pnpm** (version in `package.json` → `packageManager`).

```bash
pnpm install
pnpm dev          # default port 3000; override with PORT=8080
pnpm build && pnpm start   # production-style
pnpm test
```

**High level layout:**

| Area | Role |
| --- | --- |
| `src/index.ts` | Server entry, `PORT` from env |
| `src/app.ts` | Hono app, OpenAPI doc, Swagger UI, route wiring |
| `src/openapi-routes.ts` | OpenAPI routes and Zod schemas |
| `src/timeedit.ts` | Low-level TimeEdit HTTP (cookies, CSRF, upstream calls) |
| `src/routes/` | Handlers (auth, rooms, bookings, schedules) |
| `src/middleware/auth.ts` | Bearer JWT → session cookie |
| `src/parsers/` | HTML parsing for schedules and “my bookings” |
| `src/timeedit-time.ts` | `Europe/Stockholm` helpers: minute ISO, interval formatting, create-interval parsing (incl. `PT…`) |

End-to-end tests in `src/tests/e2e.test.ts` hit the real TimeEdit backend; they are skipped unless you set `TIMEEDIT_TOKEN` (see that file / `pnpm test:e2e`).

---

**AI disclaimer:** This project was largely vibe-coded with AI assistance. Do **not** rely on it for anything important without **testing and verifying** behaviour yourself, especially login flows, upstream HTML shapes, and Chalmers/TimeEdit changes that can break parsers or SSO without warning. The E2E-tests in this repo will hopefully alert me if something breaks but there's no guarantee from me :)
