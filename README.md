# TimeEdit API Wrapper

A small, **stateless** HTTP service that wraps [Chalmers](https://www.chalmers.se/) student-facing **TimeEdit Cloud** (`cloud.timeedit.net`). It exposes predictable JSON for listing **group rooms** (Grupprum), reading **weekly busy grids** for those rooms, and managing **your own** reservations (list, book, cancel).

The service does **not** store sessions or credentials on disk. Each authenticated API call uses the TimeEdit `teauthtoken` JWT you obtain at login, exchanges it for a short-lived `TEchalmersweb` cookie, then talks to TimeEdit the same way the browser UI does (JSON endpoints and HTML pages, with HTML parsed server-side).

## Why this exists

TimeEdit’s student UI is interactive and session-oriented. This project turns the common operations into:

- **`GET /api/rooms`** — catalog of bookable group rooms
- **`GET /api/bookings`** — week schedule grids (busy intervals) for all matching rooms
- **`GET|POST|DELETE /api/my/bookings`** — your reservations

plus **OpenAPI 3.1** at `/openapi` and **Swagger UI** at `/swagger`.

## Requirements

- **Node.js** (current LTS recommended; the project targets ES2022)
- **pnpm** — see `packageManager` in `package.json` (e.g. `pnpm@10.28.2`)

## Install and run

```bash
pnpm install
pnpm dev
```

By default the server listens on **port 3000**. Override with:

```bash
PORT=8080 pnpm dev
```

Production-style run:

```bash
pnpm build
pnpm start
```

## Authentication

### Chalmers SSO → TimeEdit JWT

Group-room booking uses your Chalmers identity. The wrapper implements the browser login path against **Chalmers ADFS** and returns the **TimeEdit JWT** (`teauthtoken`) embedded in the final redirect.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/auth/login` | JSON help and example body for `POST` |
| `POST` | `/auth/login` | Body: `{ "username", "password" }` → `{ "token": "<jwt>" }` on success |

Example:

```bash
curl -sS -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"cid@chalmers.se","password":"..."}'
```

On failure you get **401** with `{ "error", "detail" }`. This path may break if Chalmers or TimeEdit change their SAML/HTML login flows; the start URL and form handling live in `src/routes/auth.ts`.

### Calling the API

All routes under **`/api/*`** require:

```http
Authorization: Bearer <token>
```

where `<token>` is the value from `POST /auth/login`. Middleware (`src/middleware/auth.ts`) exchanges the JWT for a `TEchalmersweb` cookie via `POST` to the TimeEdit web root (`src/timeedit.ts`). If that exchange fails, you’ll see **502** with an error payload.

**Security notes:**

- Always use **HTTPS** in front of this service in any real deployment so credentials and tokens are not sent in clear text.
- Treat the JWT like a **session secret**: anyone with it can act as you on TimeEdit until it expires.

## API overview

Interactive documentation: after starting the server, open [`/swagger`](http://localhost:3000/swagger) or fetch [`/openapi`](http://localhost:3000/openapi).

Root [`/`](http://localhost:3000/) returns a small JSON index with the same links and route list.

### Rooms

#### `GET /api/rooms`

Returns an array of rooms from TimeEdit `objects.json`, filtered to group-room booking types. Each item includes:

- `id` — TimeEdit object id (use as `roomId` when booking)
- `name` — room name (e.g. `KG34`)
- `campus`, `equipment`, `capacity` (nullable if unknown)

### Weekly grids (all rooms)

#### `GET /api/bookings`

Loads the same room list as `GET /api/rooms`, optionally **filters** it, then fetches each room’s **`ri.html`** week view and parses busy slots. Fetches run with **bounded concurrency** (5 at a time) on the server.

**Query parameters (all optional unless noted):**

| Parameter | Description |
|-----------|-------------|
| `weekOffset` | String integer: `0` = current week, `1` next, `-1` previous. Allowed range **-6 … 10** (default `0`). |
| `campus` | Case-insensitive substring match on `campus` |
| `q` | Case-insensitive substring match on room `name` |
| `roomIds` | Comma-separated numeric ids, e.g. `485,486` (max 100). |

**Response shape:**

- `weekOffset` — echo of the resolved offset
- `bookingRules` — text extracted from the schedule page (shared disclaimer/rules block)
- `rooms` — array of room objects, each extended with `bookings`: intervals `{ start, end, ... }`
- `errors` — optional array of `{ roomId, detail }` for rooms that failed upstream; successful rooms are still returned

If **every** room fetch fails, the handler responds with **502** and an aggregate error.

### Your bookings

#### `GET /api/my/bookings`

Parses your **`my.html`** list into an array of bookings: `id`, `start`, `end`, `room`, `createdAt` (TimeEdit’s human-readable timestamp string is passed through as-is).

#### `POST /api/my/bookings`

Body (JSON):

| Field | Type | Notes |
|-------|------|--------|
| `roomId` | string | From `GET /api/rooms` |
| `date` | string | `YYYY-MM-DD` |
| `startTime`, `endTime` | string | `H:mm` or `HH:mm` |
| `title`, `comment` | string | optional |

The server obtains a CSRF token, then posts the same form fields TimeEdit expects. Success (**200**): `{ "booking": { "id": "<reservation id>" } }`.

#### `DELETE /api/my/bookings/{id}`

Cancels the reservation by id (the value returned when creating, or from `GET /api/my/bookings`). Success: `{ "success": true }`.

## Datetime conventions

Busy slots and booking intervals use **naive local datetimes** in JSON: `YYYY-MM-DDTHH:mm:ss` **without** a `Z` or numeric offset. This matches how the TimeEdit week grid encodes wall-clock times (Europe/Stockholm in practice for Chalmers).

## HTTP errors

| Status | Typical cause |
|--------|----------------|
| **400** | Invalid JSON or OpenAPI/Zod validation (details in body) |
| **401** | Missing/malformed `Authorization: Bearer`, or failed `/auth/login` |
| **502** | Upstream TimeEdit/network error, HTML shape change, or JWT exchange failure |

Validation errors from OpenAPI routes include structured `issues` (form/field errors).

## Project layout

| Path | Role |
|------|------|
| `src/index.ts` | Node server entry, `PORT` from env |
| `src/app.ts` | Hono app, OpenAPI doc, Swagger UI, route mounting |
| `src/openapi-routes.ts` | Route definitions + Zod request/response schemas |
| `src/schemas.ts`, `src/entities.ts` | Shared Zod models and types |
| `src/timeedit.ts` | Low-level TimeEdit HTTP (cookies, CSRF, book/cancel, `objects.json`, `ri.html`, `my.html`) |
| `src/routes/` | Handlers: `auth`, `rooms`, `room-schedule`, `bookings` |
| `src/parsers/` | HTML parsing for schedules and “my bookings” |
| `src/middleware/auth.ts` | Bearer JWT → session cookie |

## Tests

```bash
pnpm test
```

**End-to-end** tests (`src/tests/e2e.test.ts`) call the real TimeEdit backend. They are **skipped** unless you set:

| Variable | Meaning |
|----------|---------|
| `TIMEEDIT_TOKEN` | Valid TimeEdit JWT (same as `Authorization: Bearer` value) |
| `E2E_ROOM_ID` | Optional; default `485` |
| `E2E_BOOKING_DATE` | Optional; `YYYY-MM-DD` for create/delete tests |

```bash
TIMEEDIT_TOKEN='...' pnpm test:e2e
```

## Limitations and stability

- **Chalmers-only**: URLs, filters, and object types are wired to Chalmers’ TimeEdit tenant (`chalmers/web/student`). Other schools would need different bases and possibly different form parameters.
- **HTML coupling**: Schedule and “my bookings” rely on parsing HTML. cosmetic changes on TimeEdit’s side can break parsers until updated.
- **SSO coupling**: `POST /auth/login` depends on ADFS forms and redirects remaining compatible with `src/routes/auth.ts`.
- **Rate and fairness**: `GET /api/bookings` triggers one upstream schedule fetch per room after filters; use `roomIds` or `q`/`campus` to narrow scope.

## License

`private: true` in `package.json` — treat as an internal or personal project unless you add a license.
