# Skatis – Backend

REST API for the Skatis tournament manager. Tournaments are protected by two
passwords (admin + member) and contain one _list_ per matchday, into which the
_games_ are entered.

## Stack

| Concern    | Choice                                      |
| ---------- | ------------------------------------------- |
| Runtime    | Node.js ≥ 22 (ESM, TypeScript)              |
| HTTP       | Express 5                                   |
| Database   | PostgreSQL via Prisma ORM                   |
| Validation | Zod                                         |
| Auth       | Password login → JWT bearer token (HS256)   |
| Passwords  | scrypt (`node:crypto`), salted per password |
| Logging    | Pino (pretty in development, JSON in prod)  |
| Tests      | Vitest + Supertest                          |

## Requirements

- Node.js ≥ 22.12
- A PostgreSQL 14+ database you can reach with a connection string

## Setup

```bash
cd backend
npm install                       # also runs `prisma generate`

cp .env.example .env              # then edit the values
# DATABASE_URL must point at YOUR PostgreSQL instance,
# JWT_SECRET must be a random string of at least 32 characters

npm run db:migrate -- --name init # creates the tables
npm run dev                       # http://localhost:3000/api
```

Generate a proper secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Everything is installed locally – no global packages and no root privileges are
required.

## Scripts

| Script                  | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | Watch mode via `tsx`                           |
| `npm run build`         | Compile to `dist/`                             |
| `npm start`             | Run the compiled server                        |
| `npm test`              | Vitest (unit + HTTP tests, no database needed) |
| `npm run test:coverage` | Coverage report in `coverage/`                 |
| `npm run typecheck`     | `tsc --noEmit`                                 |
| `npm run lint`          | ESLint                                         |
| `npm run format`        | Prettier                                       |
| `npm run db:migrate`    | Create/apply a migration (development)         |
| `npm run db:deploy`     | Apply existing migrations (production)         |
| `npm run db:studio`     | Prisma Studio                                  |

## Authentication

A tournament has two passwords:

- **admin password** – may change matchdays, reset the member password, and
  create/correct/delete lists at any time, including for past matchdays.
- **member password** – may create the list of the _current_ matchday, enter
  games and submit that list.

Both are exchanged for a JWT scoped to exactly one tournament:

```bash
# 1. create a tournament (no auth required)
curl -X POST http://localhost:3000/api/tournaments \
  -H 'Content-Type: application/json' \
  -d '{
        "name": "Mittwochsrunde",
        "adminPassword": "admin-secret",
        "password": "member-secret",
        "matchdays": [3]
      }'

# 2. exchange a password for a token
curl -X POST http://localhost:3000/api/tournaments/Mittwochsrunde/sessions \
  -H 'Content-Type: application/json' \
  -d '{"password": "member-secret"}'
# => { "data": { "token": "...", "role": "MEMBER", "expiresAt": "...", "tournament": {...} } }

# 3. use the token
curl http://localhost:3000/api/tournaments/Mittwochsrunde/lists \
  -H "Authorization: Bearer $TOKEN"
```

Which role a token carries is decided by which password matched. A token is
rejected (403) as soon as the `:tournamentName` in the path differs from the one
it was issued for.

## Domain rules

- A tournament is identified by its **name** (unique, immutable – renaming would
  break existing URLs and tokens).
- `matchdays` are ISO weekdays (`1` = Monday … `7` = Sunday). A list only exists
  for a matchday of its tournament.
- There is **at most one list per matchday** (unique constraint).
- A `MEMBER` may only work on the list of _today's_ matchday
  (`TZ` environment variable decides "today"); an `ADMIN` may also create and
  correct lists of past days.
- A submitted list is frozen. `MEMBER` cannot change it; an `ADMIN` has to
  reopen it first (`POST .../reopen`).
- Deleting a tournament deletes its lists and games (cascade).

## Endpoints

Base URL: `http://localhost:3000/api`

### Health

| Method | Path            | Auth | Description                           |
| ------ | --------------- | ---- | ------------------------------------- |
| GET    | `/health`       | –    | Liveness; does not touch the database |
| GET    | `/health/ready` | –    | Readiness incl. DB connectivity       |
| GET    | `/`             | –    | Discovery document                    |

### Tournaments

| Method | Path                          | Auth  | Description                                               |
| ------ | ----------------------------- | ----- | --------------------------------------------------------- |
| POST   | `/tournaments`                | –     | Create (`name`, `adminPassword`, `password`, `matchdays`) |
| GET    | `/tournaments`                | –     | List (`?search=&limit=&offset=`)                          |
| GET    | `/tournaments/:name`          | –     | Details                                                   |
| PATCH  | `/tournaments/:name`          | ADMIN | Change `matchdays`, `password`, `adminPassword`           |
| DELETE | `/tournaments/:name`          | ADMIN | Delete incl. lists and games                              |
| POST   | `/tournaments/:name/sessions` | –     | Exchange a password for a token                           |

### Lists

`:matchday` is always a `YYYY-MM-DD` date.

| Method | Path                                        | Auth  | Description                                        |
| ------ | ------------------------------------------- | ----- | -------------------------------------------------- |
| GET    | `/tournaments/:name/lists`                  | any   | `?from=&to=&status=OPEN\|SUBMITTED&limit=&offset=` |
| POST   | `/tournaments/:name/lists`                  | any   | `{ matchday, games?: [...] }`                      |
| GET    | `/tournaments/:name/lists/:matchday`        | any   | List incl. its games                               |
| DELETE | `/tournaments/:name/lists/:matchday`        | ADMIN | Delete list incl. games                            |
| POST   | `/tournaments/:name/lists/:matchday/submit` | any   | Freeze the list                                    |
| POST   | `/tournaments/:name/lists/:matchday/reopen` | ADMIN | Reopen a submitted list                            |

### Games

| Method | Path                                               | Auth | Description           |
| ------ | -------------------------------------------------- | ---- | --------------------- |
| GET    | `/tournaments/:name/lists/:matchday/games`         | any  | All games of the list |
| POST   | `/tournaments/:name/lists/:matchday/games`         | any  | Add a game            |
| PATCH  | `/tournaments/:name/lists/:matchday/games/:gameId` | any  | Update a game         |
| DELETE | `/tournaments/:name/lists/:matchday/games/:gameId` | any  | Delete a game         |

A game looks like this – `position` is assigned automatically when omitted:

```json
{
  "position": 1,
  "players": ["Anna", "Bert", "Clara"],
  "declarer": "Anna",
  "gameType": "Grand",
  "points": 48,
  "note": "Hand game"
}
```

## Response format

Success:

```json
{ "data": {}, "meta": { "total": 12, "limit": 20, "offset": 0 } }
```

`meta` is only present on paginated collections. Errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { "issues": [{ "path": "matchday", "code": "custom", "message": "…" }] },
    "requestId": "9f0f0f0e-…"
  }
}
```

| Status | Code                  | Meaning                                       |
| ------ | --------------------- | --------------------------------------------- |
| 400    | `BAD_REQUEST`         | Malformed JSON body                           |
| 401    | `UNAUTHORIZED`        | Missing/invalid token or wrong password       |
| 403    | `FORBIDDEN`           | Wrong role/ wrong tournament / wrong day      |
| 404    | `NOT_FOUND`           | Unknown tournament, list or game              |
| 409    | `CONFLICT`            | Duplicate name/matchday/position, frozen list |
| 413    | `PAYLOAD_TOO_LARGE`   | Body larger than 100 kb                       |
| 422    | `VALIDATION_ERROR`    | Payload or path/query validation failed       |
| 500    | `INTERNAL_ERROR`      | Unexpected server error                       |
| 503    | `SERVICE_UNAVAILABLE` | Database not reachable                        |

Every response carries an `X-Request-Id` header (echoing a caller-provided
`X-Request-Id` when it is a sane value) that also appears in the logs.

## Configuration

All settings come from the environment – see `.env.example`:

| Variable         | Default            | Description                                |
| ---------------- | ------------------ | ------------------------------------------ |
| `NODE_ENV`       | `development`      | `development`, `test` or `production`      |
| `PORT` / `HOST`  | `3000` / `0.0.0.0` | HTTP bind address                          |
| `DATABASE_URL`   | –                  | PostgreSQL connection string (required)    |
| `JWT_SECRET`     | –                  | ≥ 32 characters (required)                 |
| `JWT_EXPIRES_IN` | `12h`              | Token lifetime                             |
| `LOG_LEVEL`      | `info`             | `fatal`…`trace` or `silent`                |
| `CORS_ORIGIN`    | `*`                | Comma separated origins or `*`             |
| `TZ`             | system             | Timezone that decides the current matchday |

Invalid configuration aborts startup with a list of the offending variables.

## Project structure

```
backend/
├── prisma/schema.prisma        # data model (Tournament, GameList, Game)
├── src/
│   ├── app.ts                  # express app factory
│   ├── server.ts               # bootstrap + graceful shutdown
│   ├── config/env.ts           # validated environment
│   ├── lib/                    # dates, errors, logger, prisma, passwords, tokens
│   ├── middleware/             # auth, cors, error handler, request context
│   ├── modules/
│   │   ├── tournaments/        # schemas, service, routes
│   │   ├── lists/              # lists + games, access rules
│   │   └── health/
│   └── routes/index.ts         # mounts /api
└── tests/                      # vitest + supertest
```

Layering: `routes` (HTTP, validation) → `service` (business rules, Prisma) →
`mapper` (DTOs). Exceptions are `HttpError`s that the central error handler maps
to the envelope above; Express 5 forwards rejected promises automatically.

## Tests

`npm test` runs without a database – the suite covers password hashing, token
handling, every Zod schema and the HTTP layer (routing, auth, CORS, error
envelope). Business logic that needs PostgreSQL has to be exercised against a
real instance.

## Deployment notes

- Build with `npm run build`, then run `npm start`.
- Apply migrations with `npm run db:deploy` before starting the new version.
- `SIGINT`/`SIGTERM` trigger a graceful shutdown (stop accepting requests, close
  the Prisma pool, force exit after 10 s).
- Run behind a TLS terminating proxy; tokens are sent as bearer headers.
