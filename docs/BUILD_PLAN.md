# Surf Alerts — Build Plan & Technical Specification

**Last updated:** October 18, 2026

Surf Alerts is a web app I'm building that watches surf forecasts for me. I pick a surf break, describe the conditions I want, and the app emails me when the forecast matches, so I don't have to keep checking surf reports throughout the day.

This document describes what the app does, how it works, where it stands, and what I'm building next.

### Status legend

| Mark | Meaning |
|---|---|
| ✅ | Done and tested |
| 🔶 | Built and covered by automated tests; still checking it in the browser |
| ⬜ | Not started |

### Where things stand

- ✅ Forecasts, alert management, wind-aware matching, accounts, per-account alerts, Alert History, and the side-menu layout.
- ✅ Email notifications end to end: dry run, a real send to the alert's owner, failure handling, and once-per-day deduplication.
- ✅ CSRF protection and login/registration rate limiting.
- ⬜ Server-side session revocation, security logging, deployment, README and demo.

---

## 1. What the App Does

**"Tell me when my surf spot has the conditions I want."**

An example rule:

> Notify me when **El Porto** has forecast wave heights of **3–6 ft**, a minimum swell period of **12 seconds**, and wind **at or below 8 knots**.

The app combines hourly marine and weather forecasts from Open-Meteo, checks every active rule on a schedule, records the forecast hours that match, and sends the rule's owner an email, at most once per rule per day.

Forecast values are **modeled estimates**, not guarantees of breaking-wave height or safe conditions, so it's always worth checking conditions at the beach.

### Using the app

1. **Sign in:** A new visitor sees a Login / Register page. A returning visitor with a valid session goes straight in.
2. **Create an account:** An email and password. The password is hashed, and the session lives in an HTTP-only cookie.
3. **Navigate:** A side menu (tabs at the top on narrow screens) links to **Surf Spots**, **My Alerts**, and **Alert History**. Each page has its own URL (`#/spots`, `#/alerts`, `#/history`), so refreshing and the back button keep your place.
4. **Surf Spots:** Pick a spot card (e.g. **El Porto**, **Malibu Surfrider**) to see the next 12 hours of wave height and period, swell height, period, and direction, and wind speed and direction, in local time with compass labels.
5. **My Alerts — create:** Name an alert, choose a break, and set minimum and maximum wave height, minimum swell period, and an optional maximum wind speed.
6. **My Alerts — manage:** Edit thresholds, pause or reactivate, or delete with a confirmation step. A green circle means active; orange means paused.
7. **Monitoring:** A background worker checks every active alert every 30 minutes and saves newly matching forecast hours.
8. **Notifications:** When an alert matches, the account that owns it gets an email, at most once per alert per surf day.
9. **Alert History:** Choose an alert to see its saved matching forecast hours and every email attempt with its status.
10. **Coming back:** Everything is stored in PostgreSQL. Logging out ends the session; logging back in shows only that account's alerts.

### Interface details

- Validation and success messages appear next to the form, not at the top of the page.
- Alert state is shown with text plus a colored circle, never color alone.
- Forms reject reversed wave ranges, negative values, and missing required fields.
- A blank maximum wind speed means **no wind restriction**, not 0 knots.
- Deleting an alert asks for confirmation and also removes its history.
- Empty, loading, and error states explain what's happening; the app never implies an email was delivered when sending is turned off.

---

## 2. Scope

### MVP

- Register, log in, stay signed in across refreshes, and log out.
- Keep each account's alerts private, enforced by the API on every read and change.
- List surf spots and show hourly marine and weather forecasts.
- Create, list, edit, pause/reactivate, and delete alerts.
- Match on wave-height range, minimum swell period, and optional maximum wind speed.
- Check forecasts on a schedule and record matching hours without duplicates.
- Email the alert's owner, record the result, and never send twice for the same alert and day.
- Show each alert's match and notification history.
- Tests, setup instructions, and a live deployment.

### Later

- More breaks, and a way to add your own.
- Offshore/onshore wind classification based on each beach's real orientation.
- Swell-direction filters, tides, surf-quality scores, push/SMS, quiet hours, digests.
- Maps, richer forecast charts, calendars, nicer email templates.
- Password reset, email verification, social login, profile settings.
- Analytics, an admin panel, real-time updates.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + TypeScript + Vite | Pages, login/register, alert forms, history |
| Styling | Plain CSS | Responsive spot cards, forms, status indicators, side menu |
| API | Python 3.12 + FastAPI | REST endpoints, validation, authentication, authorization |
| Schemas | Pydantic v2 | Request/response validation |
| Database | PostgreSQL 17 | Users, spots, alerts, matches, deliveries |
| ORM | SQLAlchemy 2 | Models, queries, transactions |
| Migrations | Alembic | Versioned schema changes in `backend/migrations/versions` |
| Forecast data | Open-Meteo Marine API | Hourly wave and swell values |
| Wind data | Open-Meteo Weather API | Hourly 10-meter wind speed and direction |
| HTTP client | httpx (async) | Forecast requests |
| Scheduling | APScheduler 3 | 30-minute checks in a separate worker process |
| Email | Resend | Notifications and provider message IDs |
| Authentication | pwdlib (Argon2) + PyJWT | Password hashing and signed session tokens |
| Sessions | HTTP-only cookie + CSRF token | Session unreadable by JavaScript; CSRF header on every change |
| Tests | pytest, FastAPI TestClient | Matching, forecasts, authorization, history, security |

### Configuration (names only)

`backend/.env` holds:

```dotenv
DATABASE_URL=postgresql+psycopg:///surf_alerts
JWT_SECRET_KEY=<random secret, at least 32 characters>
COOKIE_SECURE=false
RESEND_API_KEY=<provider secret>
EMAIL_FROM=<verified sender>
TEST_EMAIL_TO=<development recipient>
EMAIL_NOTIFICATIONS_ENABLED=false
MAX_EMAILS_PER_CHECK=1
```

`.env` is never committed. In production, secrets come from the host, and `COOKIE_SECURE=true` is set behind HTTPS.

---

## 4. Architecture

```text
                    WEB BROWSER
             React + TypeScript + Vite
                          |
              /api/* (Vite proxy in dev)
                          |
                     FASTAPI API
               (CSRF check middleware)
       +------------------+---------------------+
       |                  |                     |
  Auth / Sessions    Surf Spot Forecasts   Alert CRUD / History
       |                  |                     |
   User table       Open-Meteo Marine       User-owned alerts
   Argon2 / JWT     Open-Meteo Weather      + authorization
   rate limits            |                     |
       +------------------+---------------------+
                          |
                     POSTGRESQL
             users / surf_spots / alerts
           alert_matches / notification_deliveries
                          ^
                          |
            SCHEDULED MONITORING WORKER
          python -m app.worker (APScheduler)
                          |
                   Matching engine
                          |
            Deduplicated match records
                          |
                  Notification service
                          |
                    Resend email API
                          |
                  Alert owner's inbox
```

The API server and the monitoring worker are separate processes. The API answers browser requests; the worker runs on its own schedule, so monitoring doesn't depend on anyone having the site open.

In development, React runs on `localhost:5173` and FastAPI on `127.0.0.1:8000`. Vite forwards `/api/...` to FastAPI and strips the `/api` prefix, so the frontend calls `/api/spots`, `/api/alerts`, `/api/auth/me`, and so on.

---

## 5. Repository Structure

The Alembic directory is `migrations/`, not `alembic/`.

```text
surf-alerts/
├── .gitignore
├── docs/
│   └── BUILD_PLAN.md               # This file
├── backend/
│   ├── .env                        # Local only; never committed
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── migrations/
│   │   ├── env.py
│   │   └── versions/               # Schema migrations
│   ├── app/
│   │   ├── main.py                 # Routes, ownership checks, CSRF middleware
│   │   ├── auth.py                 # Register/login/me/logout, cookies, CSRF, rate limits
│   │   ├── database.py             # Engine, sessions, Base, get_db
│   │   ├── models.py               # User, SurfSpot, Alert, AlertMatch, NotificationDelivery
│   │   ├── schemas.py              # Pydantic models and validation
│   │   ├── seed.py                 # Seeds the initial surf spots
│   │   ├── data/
│   │   │   └── spots.py            # Surf spot seed data
│   │   ├── worker.py               # Scheduled monitoring process
│   │   └── services/
│   │       ├── forecast.py         # Open-Meteo fetch and normalization
│   │       ├── matching.py         # Wave/swell/wind rule evaluation
│   │       ├── monitoring.py       # Per-spot checks, saving matches, triggering emails
│   │       ├── notifications.py    # Dry-run switch, per-day dedup, owner lookup, status
│   │       └── email.py            # Resend adapter
│   └── tests/
│       ├── conftest.py             # In-memory test DB, logged-in clients, rate-limit reset
│       ├── test_matching.py
│       ├── test_forecast.py
│       ├── test_wind_matching.py
│       ├── test_alert_ownership.py
│       ├── test_alert_history.py
│       └── test_security.py
└── frontend/
    ├── package.json
    ├── vite.config.ts              # /api development proxy
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                 # Session check, side menu, page selection
        ├── Dashboard.tsx           # Surf Spots and My Alerts pages
        ├── api.ts                  # CSRF header helper
        ├── index.css
        ├── auth.css
        └── components/
            ├── AuthPage.tsx        # Login / registration
            ├── SideNav.tsx         # Side menu
            ├── SideNav.css
            ├── ForecastCard.tsx    # One forecast hour
            ├── ForecastCard.css
            ├── AlertHistory.tsx    # Alert History page
            └── AlertHistory.css
```

### What each piece does

- **`App.tsx`** checks the session, shows either the login page or the app, renders the side menu, and picks the page from the URL.
- **`Dashboard.tsx`** loads spots and the user's alerts and renders either the Surf Spots page or the My Alerts page. Switching between the two keeps the selected spot and any half-filled form.
- **`AlertHistory.tsx`** loads one alert's saved matches and delivery records.
- **`AuthPage.tsx`** handles login and registration, with errors shown next to the form.
- **`ForecastCard.tsx`** displays one forecast hour with units and compass directions.
- **`api.ts`** reads the `csrf_token` cookie and builds the `X-CSRF-Token` header.
- **`main.py`** holds thin route handlers that enforce login, ownership, and CSRF, and hand forecast and matching work to the services.
- **`auth.py`** handles password hashing, session and CSRF cookies, rate limiting, and the current-user dependency.
- **`forecast.py`** fetches marine and weather data and merges them hour by hour.
- **`monitoring.py`** runs the scheduled check, fetching each spot's forecast once for all of its alerts.
- **`notifications.py`** decides whether to send, enforces once-per-day, looks up the owner's email, and records the outcome.

---

## 6. Database Design

```text
users (1) ────────────< (many) alerts >────────── (1) surf_spots
                              |
                              +────< alert_matches
                              |
                              +────< notification_deliveries
```

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `email` | VARCHAR(255) | Unique, indexed, stored lowercase |
| `password_hash` | VARCHAR(255) | Argon2 hash; passwords are never stored |
| `created_at` | TIMESTAMPTZ | Defaults to now |

### `surf_spots`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `slug` | VARCHAR(100) | Unique, e.g. `el-porto`; used in forecast URLs |
| `name` | VARCHAR(100) | Display name |
| `latitude` | FLOAT | −90 to 90 |
| `longitude` | FLOAT | −180 to 180 |
| `region` | VARCHAR(100) | Location label |

Spots are shared by everyone; alerts belong to individual users.

### `alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `user_id` | INTEGER | Required, references `users.id`, indexed |
| `name` | VARCHAR(100) | Label |
| `spot_id` | INTEGER | Required, references `surf_spots.id` |
| `min_wave_height_ft` | FLOAT | ≥ 0 |
| `max_wave_height_ft` | FLOAT | ≥ 0 and ≥ the minimum |
| `min_swell_period_s` | FLOAT | > 0 |
| `max_wind_speed_kn` | FLOAT, nullable | ≥ 0; empty means no wind limit |
| `is_active` | BOOLEAN | Defaults to true; paused alerts aren't checked |

A database constraint enforces `min_wave_height_ft <= max_wave_height_ft`, and the API validates input too.

**Ownership:** `user_id` always comes from the logged-in session, never from the request body. `GET /alerts` returns only your own alerts, and every single-alert route returns 404 for an alert you don't own, so other people's alerts can't even be confirmed to exist.

### `alert_matches`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `alert_id` | INTEGER | References `alerts.id` |
| `forecast_time` | TIMESTAMPTZ | The matching forecast hour, in UTC |
| `detected_at` | TIMESTAMPTZ | When the worker recorded it |

A unique constraint on `(alert_id, forecast_time)` means the worker can check the same forecast again without saving duplicates. It inserts with `INSERT ... ON CONFLICT DO NOTHING RETURNING id`; if an id comes back, the match is new.

### `notification_deliveries`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `alert_id` | INTEGER | References `alerts.id` |
| `surf_date` | DATE | The surf day, in Pacific time |
| `recipient` | VARCHAR(255) | The owner's email address |
| `status` | VARCHAR(20) | `pending`, `sent`, or `failed` |
| `provider_message_id` | VARCHAR(255), nullable | Resend's message ID |
| `created_at` | TIMESTAMPTZ | When the attempt started |
| `sent_at` | TIMESTAMPTZ, nullable | When Resend accepted it |

A unique constraint on `(alert_id, surf_date)` allows only one email attempt per alert per day.

### How records change

- **Create:** the alert is saved with the logged-in user's id.
- **Edit:** the alert is looked up by both its id and the user's id before anything changes.
- **Delete:** the alert's matches and delivery records are deleted first, then the alert.
- **Pause:** the worker skips the alert, and its history is kept.

---

## 7. API

**CSRF rule:** Every `POST`, `PUT`, `PATCH`, and `DELETE` made with a session must include an `X-CSRF-Token` header that matches the `csrf_token` cookie, or the API returns **403**. Login and registration are exempt, and `GET` requests never need it.

### Authentication

| Method | Route | Access | Behavior |
|---|---|---|---|
| POST | `/auth/register` | Public | Creates the account and sets the session and CSRF cookies. **429** after 10 attempts per IP per hour |
| POST | `/auth/login` | Public | Checks the password and sets the session and CSRF cookies. **429** (with `Retry-After`) after 5 failures for one email from one IP, or 20 from one IP, within 15 minutes |
| GET | `/auth/me` | Session | Returns the user's id and email; also refreshes the CSRF cookie |
| POST | `/auth/logout` | Session + CSRF | Clears both cookies |

### Forecasts and surf spots

| Method | Route | Access | Behavior |
|---|---|---|---|
| GET | `/` | Public | Welcome message |
| GET | `/health` | Public | Health check |
| GET | `/forecast?latitude=&longitude=` | Public | Raw forecast data |
| GET | `/forecast/summary?...` | Public | Normalized hourly forecast |
| GET | `/spots` | Public | List surf spots |
| GET | `/spots/{spot_id}/forecast` | Public | Forecast for a spot, looked up by **slug** |
| POST | `/spots` | Session + CSRF | Add a spot; duplicate slugs are rejected |

### Alerts

| Method | Route | Access | Behavior |
|---|---|---|---|
| POST | `/alerts` | Session + CSRF | Create an alert owned by the current user |
| GET | `/alerts` | Session | List the current user's alerts |
| GET | `/alerts/{alert_id}/matches` | Owner | Check the latest forecast right now |
| GET | `/alerts/{alert_id}/history` | Owner | The 20 most recent saved matches and 20 most recent email attempts |
| PATCH | `/alerts/{alert_id}` | Owner + CSRF | Pause or reactivate |
| PUT | `/alerts/{alert_id}` | Owner + CSRF | Replace the name, spot, conditions, and state |
| DELETE | `/alerts/{alert_id}` | Owner + CSRF | Delete the alert and its history (204) |

`/matches` evaluates the **current forecast** on demand; `/history` shows what the **worker saved earlier**.

### Example: create an alert

```json
{
  "name": "Morning El Porto",
  "spot_id": 1,
  "min_wave_height_ft": 3,
  "max_wave_height_ft": 6,
  "min_swell_period_s": 12,
  "max_wind_speed_kn": 8,
  "is_active": true
}
```

`"max_wind_speed_kn": null` means no wind limit. `user_id` isn't part of the request; the server sets it.

---

## 8. Forecast Data

### Sources

- **Marine API** (`marine-api.open-meteo.com/v1/marine`): `wave_height`, `wave_period`, `wave_direction`, `swell_wave_height`, `swell_wave_period`, `swell_wave_direction`.
- **Weather API** (`api.open-meteo.com/v1/forecast`): `wind_speed_10m` and `wind_direction_10m`, in knots, using the nearest sea grid cell.

### Normalized hourly fields

| Field | Meaning | Units |
|---|---|---|
| `time` | Forecast hour | ISO timestamp |
| `wave_height_ft` | Modeled wave height | feet (meters × 3.28084) |
| `wave_period_s` | Wave period | seconds |
| `wave_direction_deg` | Direction waves come **from** | degrees |
| `swell_height_ft` | Modeled swell height | feet |
| `swell_period_s` | Swell period | seconds |
| `swell_direction_deg` | Direction swell comes **from** | degrees |
| `wind_speed_kn` | Wind at 10 m | knots |
| `wind_direction_deg` | Direction wind comes **from** | degrees |

- Marine and weather data are merged by timestamp, not by position in the list.
- Missing values stay empty; missing wind is never treated as calm.
- The forecast view shows compass points (N, NE, E, …) and `N/A` for missing values.
- The Surf Spots page shows the next 12 hours from the current Pacific hour.
- The worker works in UTC; emails group matches by the Pacific-time surf day.
- Weather and marine grid cells may differ; the numbers are model output, not readings from the beach.

### Matching rule

A forecast hour matches an alert when:

```text
the alert is active
AND wave height is present and within [min, max]
AND swell period is present and >= the minimum
AND (the alert has no wind limit
     OR wind speed is present and <= the limit)
```

An alert without a wind limit still matches when wind data is missing; an alert that requires wind ≤ 8 kn doesn't.

---

## 9. Monitoring and Email

### Each check

1. The worker runs `check_all_alerts()` at startup and every 30 minutes after that.
2. It loads active alerts with their spots and groups them by spot, so each forecast is fetched once per check.
3. It looks at forecast hours in the next 24 hours.
4. It evaluates each alert against those hours.
5. New matches are saved and logged as `NEW MATCH`; ones already saved are skipped.
6. Matches are grouped by Pacific surf day, and each day is checked against earlier deliveries.
7. If email is turned off, it logs `DRY RUN` with the would-be recipient and sends nothing.
8. If email is on, it emails the alert owner, up to `MAX_EMAILS_PER_CHECK` per check, and records the result.

### Email rules

- Emails always go to the alert owner's account email.
- `EMAIL_NOTIFICATIONS_ENABLED=false`, the default, means dry run.
- `sent` means Resend **accepted** the message, not that it reached the inbox.
- `pending` means an attempt started but wasn't confirmed; `failed` means sending raised an error.
- One attempt per alert per surf day. History stays when an alert is paused or edited and is removed when it's deleted.
- **Known limitation:** the delivery row is reserved before the email is sent. That prevents duplicates, but a crash can leave a row stuck at `pending`, and a `failed` row blocks any retry for that day. Production needs a proper retry policy.
- Resend's test mode only delivers to the email address on the Resend account. Sending to anyone else requires a verified domain.

---

## 10. Security

### How it works

- **Passwords** are hashed with Argon2 and never stored.
- **Sessions** are signed JWTs (user id, 7-day expiry) in an `HttpOnly`, `SameSite=Lax` cookie, which JavaScript can't read. The `Secure` flag is controlled by `COOKIE_SECURE` and must be on under HTTPS.
- **CSRF protection** uses a signed double-submit token. At login the server also sets a readable `csrf_token` cookie, an HMAC-SHA256 of the session token keyed with the server secret. The frontend sends it back in `X-CSRF-Token` on every change, and middleware rejects mismatches with 403. Because the token is tied to the session, one session's token can't be used with another. `/auth/me` refreshes the cookie, so sessions that existed before CSRF protection keep working.
- **Rate limiting** caps failed logins per email and IP and per IP, and caps registrations per IP (limits in §7). A successful login resets that account's count.
- **Authorization:** every alert route checks both the alert id and the owner. Other users' alerts return 404.
- **Logout** clears the cookies, but the token itself stays valid until it expires; there's no server-side revocation yet.

### Limitations and remaining work

- Rate-limit counts are kept in memory, so they reset on restart and only work within a single API process. Several instances would need a shared store such as Redis.
- Behind a reverse proxy, uvicorn must run with `--proxy-headers` and a trusted `--forwarded-allow-ips`, or every visitor looks like the proxy's IP. Locally, every request arrives from `127.0.0.1` through Vite.
- Still to do: server-side session revocation, security event logging, HTTPS-only cookies in production, a CORS and proxy review, secrets management, dependency scanning, and limits on public forecast requests.
- Forecast and spot listing routes are public on purpose; adding a spot requires a session.
- Authorization is enforced in the application; PostgreSQL row-level security isn't used.

---

## 11. Testing

### Automated tests (32 passing)

| File | Covers |
|---|---|
| `conftest.py` | Shared setup: in-memory SQLite database, logged-in test clients that send the CSRF header, rate-limit reset |
| `test_matching.py` | Wave and swell matching, paused alerts, inclusive bounds, grouping by Pacific date |
| `test_forecast.py` | Height conversion, wind alignment, missing wind |
| `test_wind_matching.py` | Wind below, at, and above the limit; missing wind; no limit; paused |
| `test_alert_ownership.py` | Login required; one user can't list, edit, pause, delete, or check another user's alerts |
| `test_alert_history.py` | The owner sees history; other users get 404; login required |
| `test_security.py` | Missing, wrong, and other-session CSRF tokens rejected; reads exempt; CSRF cookie refresh; logout; login lockout, reset on success, per-account limits, registration limit |

The tests run against an in-memory SQLite database, so PostgreSQL-specific behavior such as `ON CONFLICT` is verified by running the real worker.

### Manual checks

1. Register account A and create an El Porto alert.
2. Log in as account B: A's alert isn't there.
3. As B, request A's alert directly (matches, edit, pause, delete, history): every request returns 404 and nothing changes.
4. As A, edit thresholds and refresh: the changes persist, and pause/reactivate works.
5. A wind ≤ 8 kn rule matches 5 kn and 8 kn but not 11 kn or missing wind; a rule with no wind limit matches with missing wind.
6. Running the worker twice on the same forecast saves no duplicate matches.
7. With email off, nothing is sent and `DRY RUN` lines appear.
8. A controlled send reaches the owner with a provider ID recorded, and rerunning sends nothing more for that day.
9. Alert History shows saved matches, email attempts, and empty states.

### Tests to add

Expired and invalid tokens, duplicate email, password policy, validation errors, worker race conditions, retry behavior, daylight-saving transitions, missing marine data, provider outages, and notification tests with a mocked Resend client.

---

## 12. Running It Locally

PostgreSQL 17 runs through Homebrew; the database is `surf_alerts`.

**API**

```bash
cd ~/Projects/surf-alerts/backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

Interactive API docs are at `http://127.0.0.1:8000/docs`. Use the app through the Vite address so cookies stay on one origin; any change made directly against port 8000 needs the `X-CSRF-Token` header.

**Frontend**

```bash
cd ~/Projects/surf-alerts/frontend
npm run dev
```

Open the address Vite prints; if port 5173 is taken it picks another.

**Worker**

```bash
cd ~/Projects/surf-alerts/backend
source .venv/bin/activate
python -m app.worker
```

**One-off email test** (turns sending on for a single check; `.env` stays `false`)

```bash
cd ~/Projects/surf-alerts/backend && source .venv/bin/activate
EMAIL_NOTIFICATIONS_ENABLED=true MAX_EMAILS_PER_CHECK=1 python -c "
import asyncio, logging
logging.basicConfig(level=logging.INFO)
logging.getLogger('httpx').setLevel(logging.WARNING)
from app.services.monitoring import check_all_alerts
asyncio.run(check_all_alerts())"
```

**Tests and builds**

```bash
cd ~/Projects/surf-alerts/backend && source .venv/bin/activate
python -m pytest tests/ -v

cd ~/Projects/surf-alerts/frontend
npm run lint
npm run build
```

**Useful queries**

```sql
SELECT id, email FROM users ORDER BY id;
SELECT id, name, user_id, spot_id, is_active FROM alerts ORDER BY id;
SELECT alert_id, forecast_time FROM alert_matches ORDER BY detected_at DESC LIMIT 10;
SELECT alert_id, surf_date, status, recipient FROM notification_deliveries ORDER BY created_at DESC LIMIT 10;
```

Run them with `"$(brew --prefix postgresql@17)/bin/psql" -d surf_alerts`.

---

## 13. Milestones

| Area | What it includes | Status |
|---|---|---|
| Backend foundation | FastAPI, PostgreSQL, Alembic, spots, forecast API | ✅ |
| Matching and worker | Rule evaluation, UTC worker, 30-minute checks, saved matches | ✅ |
| Email | Resend, delivery records, dry-run mode, owner routing, once-per-day | ✅ |
| Forecast UI | Spot cards and hourly forecast cards | ✅ |
| Alert management | Create, edit, delete, pause/reactivate, status indicators | ✅ |
| Wind | Wind and swell direction display; optional wind limit on alerts | ✅ |
| Accounts | Register, log in, log out | ✅ |
| Per-account alerts | Every alert owned by a user and private to them | ✅ |
| Alert History | Saved matches and email attempts per alert | ✅ |
| Navigation | Side menu with Surf Spots, My Alerts, and Alert History pages | ✅ |
| CSRF protection | Signed double-submit token | ✅ |
| Rate limiting | Login and registration limits | ✅ |
| Session hardening | Server-side revocation, security logging | ⬜ |
| Deployment | Hosted frontend, API, database, worker | ⬜ |
| README and demo | Setup guide, screenshots, demo recording | ⬜ |

---

## 14. Roadmap

### Stabilize

- ✅ Database migrations current, with every alert required to have an owner.
- ✅ Tests, lint, and build passing.
- ✅ Alert History showing real stored data, private to each owner.
- ⬜ Send the user back to the login page when a session expires mid-visit, using `api.ts` as the shared place for request handling.

### Notifications

- ✅ Dry run shows who would be emailed and sends nothing.
- ✅ A real email reached the alert's owner, with Resend's message ID recorded.
- ✅ A rejected send was recorded as `failed`.
- ✅ Rerunning the worker never sends a second email for the same alert and day.
- ⬜ Notification tests with a mocked Resend client.
- ⬜ A retry policy for `pending` and `failed` deliveries.

### Security

- ✅ CSRF protection on every state-changing request.
- ✅ Login and registration rate limiting.
- ✅ Tests for cross-account and logged-out access.
- ⬜ Security event logging: failed logins, lockouts, CSRF rejections.
- ⬜ Server-side session revocation and renewal, a password policy, and HTTPS-only cookies.
- ⬜ A check that no secrets are in the repo or the frontend bundle.
- ⬜ Limits on public forecast requests.

### Deploy

- Host the frontend, API, PostgreSQL, and an always-on worker.
- Configure secrets, migrations, HTTPS, routing, and the domain.
- Confirm the worker runs without my laptop.
- Verify a Resend sending domain so emails can go to any user.
- Set up backups, health checks, and logs.

**Done when** someone on another device can sign up and get alerts while monitoring runs on its own.

### Polish

- A `README.md` with screenshots, a demo link, the architecture, the data model, setup steps, tests, and limitations.
- A short demo recording: sign up → pick a break → create a wind-aware alert → view history → log out.
- Real, measured numbers: checks per hour, forecast calls saved by grouping, test count.

---

## 15. Design Risks and Improvements

1. **Timezones:** match times are stored in UTC and converted only for display and the surf day. Daylight-saving transitions need tests.
2. **Forecast API usage:** grouping by spot already cuts calls. Timeouts, retries with backoff, caching, and quota monitoring would help.
3. **Multiple workers:** unique constraints prevent most duplicates, but running more than one worker would need safer row claims and a shared send budget.
4. **Email reliability:** the database and the email provider can't share a transaction, so retries need clear rules rather than blind resending.
5. **Edited alerts:** saved matches stay attached when an alert's thresholds change, and the old thresholds aren't stored. Alert versions could fix that.
6. **Forecast accuracy:** modeled offshore wave height isn't the same as breaking-wave height at a beach. Surf-quality scores would need coastline and bathymetry data.
7. **Sessions:** cookies and CSRF are in place; revocation and renewal aren't yet.
8. **Ownership:** every new alert-related route has to check ownership the same way.
9. **Frontend structure:** `Dashboard.tsx` could be split into smaller components, and `api.ts` grown into a typed API client.
10. **Honest labels:** emails are shown as pending, accepted, or failed, never "delivered."

---

## 16. Demo Walkthrough

1. The problem: surfers check several forecast sites a day and still miss good sessions.
2. Log in, open **Surf Spots**, and select **El Porto**.
3. Walk through the 12 hourly cards: wave height, swell period, wind speed and direction.
4. Open **My Alerts** and create `Weekend Surf`: 3–6 ft, ≥ 12 s, ≤ 8 kn. Show the validation by entering a reversed wave range, then fix it.
5. Edit, pause, and reactivate it.
6. Explain the worker: every 30 minutes, one forecast fetch per spot, deduplicated matches, one email per alert per day.
7. Open **Alert History** to show saved matches and an accepted email.
8. Log in as a second account to show its alerts are private.

---

## 17. Launch Checklist

- [ ] New users can register, log in, and log out, and sessions expire correctly.
- [ ] Spots and forecasts load, with units and timezones documented.
- [x] Creating, editing, pausing, and deleting alerts persists.
- [x] No one can read or change another account's alerts or history, even with direct API calls.
- [ ] The worker matches correctly in a real run, including missing wind and edge values (unit tests already pass).
- [x] Matches and daily emails are deduplicated.
- [x] A real owner-addressed email was accepted, and the failure path works.
- [x] History separates forecast matches from email attempts and shows only the owner's records.
- [ ] CSRF, rate limiting, secure cookies, and secrets handling are production-ready.
- [x] Tests, lint, and build pass.
- [ ] Migrations run cleanly on an empty database and on one with existing data.
- [ ] The deployment includes the API, frontend, database, always-on worker, logs, backups, and HTTPS.
- [ ] The README covers setup, architecture, limitations, screenshots, and a demo.

---

**Next:** Security event logging and server-side session revocation.
