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
- ✅ Server-side session revocation and security event logging.
- ✅ 17 Southern California breaks with search and region grouping.
- ✅ Local Breaks: each user can add up to 3 private breaks of their own.
- ✅ Interactive map of every spot, with current conditions and alert-match colors.
- ✅ Live on Fly.io at https://surf-alerts.fly.dev, with Neon Postgres.
- ✅ Redesign matching my portfolio (ajchaikovsky.com): its design tokens, light/dark themes, and HyperFrames-style motion.
- ⬜ Live deployment, README screenshots and demo.

### Resume here (October 29, 2026)

Everything is committed and pushed to `main`. The backend tests (74), lint, and build all pass, and the production Docker image was tested locally against a fresh database: migrations, seed, website, API, login, alerts, and a worker check.

**Live:** https://surf-alerts.fly.dev runs on Fly.io (one `app` machine and one `worker`) with a free Neon Postgres database in AWS US West. Deploy changes with `fly deploy` from the repo root; logs with `fly logs`. Fly needs a card on file: trial machines are stopped after 5 minutes, which stops the worker.

**Email is live:** production sends from `alerts@surf-alerts.ajchaikovsky.com`, a subdomain of my portfolio domain verified in Resend (DNS on Cloudflare). On October 30, 2026 a real alert matched and the email arrived at an address other than my Resend login.

**Database credentials:** the Neon `neondb_owner` password was rotated on October 30, 2026 after the old one was exposed; production uses the new one via Fly's `DATABASE_URL` secret, and the old one is rejected. When rotating again, update the Fly secret immediately after resetting in Neon, since the site can't reach the database in between.

**Things to remember:**

- **Local `backend/.env` has `EMAIL_NOTIFICATIONS_ENABLED=true`**, so a local worker run sends real emails. Production's settings are separate Fly secrets (`EMAIL_FROM`, `EMAIL_NOTIFICATIONS_ENABLED`).
- An alert whose matches span two Pacific days sends two emails, one per day; that's by design.
- Production uses its own JWT secret, so local and production sessions are unrelated.
- Keep production at one `app` and one `worker` machine. Rate limits are in memory, and a second worker would repeat every check.
- A `failed` or `sent` delivery blocks more emails for that alert and surf day.
- The map uses OpenStreetMap's public tiles; switch to a tile provider if traffic grows.
- Activate `backend/.venv` in every new terminal, and hard-refresh the browser after big frontend changes.

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
3. **Navigate:** A side menu (tabs at the top on narrow screens) links to **Surf Spots**, **Map**, **Local Breaks**, **My Alerts**, and **Alert History**. Each page has its own URL (`#/spots`, `#/map`, `#/breaks`, `#/alerts`, `#/history`), so refreshing and the back button keep your place.
4. **Surf Spots:** 17 Southern California breaks, from Rincon to Ocean Beach, grouped by region (Ventura, Malibu, South Bay, Orange County, San Diego) from north to south. A search box filters by spot name or region. Picking a spot scrolls to the next 12 hours of wave height and period, swell height, period, and direction, and wind speed and direction, in local time with compass labels.
5. **Map:** Every curated spot and your own local breaks on an OpenStreetMap map. Pins are blue for spots, purple for your local breaks, and green (and larger) where one of your active alerts matches the current forecast hour. Clicking a pin opens a box with the current wave height, swell period, and wind, which alerts match, and an **Add to alerts** button that opens My Alerts with that spot already selected.
6. **Local Breaks:** A dedicated page for adding up to 3 breaks of your own, by name and coordinates (pasted straight from Google Maps). The app looks up wave data for the point before saving: if it finds some, it saves the break and shows the coming hour's waves, swell period, and wind; if not, it shows "Unable to retrieve data" and saves nothing. Local breaks are private: they appear only in your own Surf Spots list, under **My Local Breaks**, and in your alert options. A break an alert still uses can't be deleted.
7. **My Alerts — create:** Name an alert, choose a break (the dropdown is grouped by region), and set minimum and maximum wave height, minimum swell period, and an optional maximum wind speed.
8. **My Alerts — manage:** Edit thresholds, pause or reactivate, or delete with a confirmation step. A green circle means active; orange means paused.
9. **Monitoring:** A background worker checks every active alert every 30 minutes and saves newly matching forecast hours.
10. **Notifications:** When an alert matches, the account that owns it gets an email, at most once per alert per surf day.
11. **Alert History:** Choose an alert to see its saved matching forecast hours and every email attempt with its status.
12. **Coming back:** Everything is stored in PostgreSQL. Logging out ends the session; logging back in shows only that account's alerts.

### Look and feel

The design matches my portfolio, [ajchaikovsky.com](https://ajchaikovsky.com): warm neutrals with one blue accent, Inter for text and IBM Plex Mono for labels, and light and dark themes (following the system setting, with a toggle that remembers the choice). The motion follows the guidance in [HyperFrames](https://github.com/heygen-com/hyperframes)' motion guide, the same rules my portfolio uses:

- Arrivals land on a long `expo.out` tail; exits are about half as long.
- Page titles blur in word by word, then hold still. The app name on the login page arrives letter by letter.
- Changing pages is a "blur swap": the new page sharpens in while the toolbar and side menu stay put.
- Lists of cards stagger in 40-80 ms apart, including cards that arrive later from the API.
- Spot cards have a cursor spotlight and a slight 3D tilt; primary buttons are magnetic.
- The side menu's highlight slides to the current page.
- The login page has a flowing colour field in WebGL behind it (a port of my portfolio's hero background, standing in for HyperFrames' aurora shader blocks), and its headline rolls through spot names like a slot machine.
- No floating, pulsing, or bouncing UI, and all motion is turned off for people who've asked for reduced motion.

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

- More curated breaks outside Southern California.
- Offshore/onshore wind classification based on each beach's real orientation.
- Swell-direction filters, tides, surf-quality scores, push/SMS, quiet hours, digests.
- Richer forecast charts, calendars, nicer email templates.
- Password reset, email verification, social login, profile settings.
- Analytics, an admin panel, real-time updates.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + TypeScript + Vite | Pages, login/register, alert forms, history |
| Styling | Plain CSS | Responsive spot cards, forms, status indicators, side menu |
| Map | Leaflet + react-leaflet, OpenStreetMap tiles | Interactive spot map |
| Motion | GSAP | Page, title, list, and pointer animations |
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
├── README.md                   # What it is, how to run it, how to deploy it
├── Dockerfile                  # Production image: builds the frontend, runs FastAPI
├── .dockerignore               # Keeps .env, virtualenvs, and tests out of the image
├── fly.toml                    # Fly.io: app and worker processes, release command
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
│   │   ├── server.py               # Production entry point: frontend at /, API at /api
│   │   ├── auth.py                 # Register/login/me/logout, cookies, CSRF, rate limits
│   │   ├── database.py             # Engine, sessions, Base, get_db
│   │   ├── models.py               # User, UserSession, SurfSpot, Alert, AlertMatch, NotificationDelivery
│   │   ├── schemas.py              # Pydantic models and validation
│   │   ├── seed.py                 # Adds any missing curated spots from data/spots.py
│   │   ├── data/
│   │   │   └── spots.py            # The curated list of surf spots
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
        ├── api.ts                  # apiFetch: CSRF header, session-ended handling
        ├── time.ts                 # Current Pacific hour, for picking forecast hours
        ├── theme.css               # Design tokens (light/dark), base type, theme toggle
        ├── motion.ts               # Every animation: timings, reduced motion, card tilt, magnetic buttons
        ├── compass.ts              # Degrees to compass directions
        ├── index.css
        ├── auth.css
        └── components/
            ├── AuthPage.tsx        # Login / registration
            ├── FlowField.tsx       # WebGL flowing colour background (login page)
            ├── RollingWord.tsx     # Slot-machine word in the login headline
            ├── Motion.tsx          # SplitText, PageHeader, Stagger
            ├── ThemeToggle.tsx     # Light/dark toggle
            ├── SideNav.tsx         # Side menu
            ├── SideNav.css
            ├── ForecastCard.tsx    # One forecast hour
            ├── ForecastCard.css
            ├── AlertHistory.tsx    # Alert History page
            ├── AlertHistory.css
            ├── LocalBreaks.tsx     # Local Breaks page
            ├── LocalBreaks.css
            ├── SpotMap.tsx         # Map page
            └── SpotMap.css
```

### What each piece does

- **`App.tsx`** checks the session, shows either the login page or the app, renders the side menu, and picks the page from the URL.
- **`Dashboard.tsx`** loads spots and the user's alerts and renders either the Surf Spots page or the My Alerts page. Switching between the two keeps the selected spot and any half-filled form.
- **`AlertHistory.tsx`** loads one alert's saved matches and delivery records.
- **`LocalBreaks.tsx`** adds, lists, and deletes the user's own breaks.
- **`SpotMap.tsx`** draws the map, colors pins using `/alerts/current-matches`, and loads a spot's current forecast when its pin is clicked.
- **`AuthPage.tsx`** handles login and registration, with errors shown next to the form.
- **`ForecastCard.tsx`** displays one forecast hour with units and compass directions.
- **`api.ts`** provides `apiFetch`, which every signed-in page uses: it adds the `X-CSRF-Token` header to state-changing requests, and on a 401 it tells `App` to show the login page, so a tab whose session ended (for example, logged out in another tab) returns to login on its next request.
- **`server.py`** is the production entry point. It serves the built React app at `/` and passes `/api/...` requests to the FastAPI app with the prefix removed, matching Vite's development proxy, so the site and API share one origin and the session cookie always reaches the API.
- **`main.py`** holds thin route handlers that enforce login, ownership, and CSRF, and hand forecast and matching work to the services.
- **`auth.py`** handles password hashing, session and CSRF cookies, rate limiting, and the current-user dependency.
- **`forecast.py`** fetches marine and weather data and merges them hour by hour.
- **`monitoring.py`** runs the scheduled check, fetching each spot's forecast once for all of its alerts.
- **`notifications.py`** decides whether to send, enforces once-per-day, looks up the owner's email, and records the outcome.

---

## 6. Database Design

```text
users (1) ────────────< (many) alerts >────────── (1) surf_spots
  |                           |
  +────< user_sessions        |
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

### `user_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(64) | Primary key; a random session id, also stored in the session token |
| `user_id` | INTEGER | References `users.id`, indexed |
| `created_at` | TIMESTAMPTZ | When the user logged in |
| `expires_at` | TIMESTAMPTZ | 7 days after login |
| `revoked_at` | TIMESTAMPTZ, nullable | Set at logout; a revoked session can't be used again |

There's one row per login, so each device has its own session. A user's expired rows are cleaned up the next time they log in.

### `surf_spots`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `slug` | VARCHAR(100) | Unique, e.g. `el-porto`; used in forecast URLs |
| `name` | VARCHAR(100) | Display name |
| `latitude` | FLOAT | −90 to 90 |
| `longitude` | FLOAT | −180 to 180 |
| `region` | VARCHAR(100) | Location label |
| `user_id` | INTEGER, nullable | Empty for curated spots everyone sees; set to the owner for a private local break |

Curated spots are shared by everyone; local breaks and alerts belong to individual users. The curated list lives in `backend/app/data/spots.py`, with coordinates at each break (checked against OpenStreetMap where it lists the break). `python -m app.seed` makes the database's curated spots match that list, adding missing spots and updating changed names, coordinates, or regions, without changing ids or touching anyone's local breaks. It's safe to rerun.

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
| POST | `/auth/logout` | Session + CSRF | Revokes the session server-side and clears both cookies |

### Forecasts and surf spots

| Method | Route | Access | Behavior |
|---|---|---|---|
| GET | `/` | Public | Welcome message |
| GET | `/health` | Public | Health check |
| GET | `/forecast?latitude=&longitude=` | Public | Raw forecast data |
| GET | `/forecast/summary?...` | Public | Normalized hourly forecast |
| GET | `/spots` | Public | Curated spots, plus the signed-in user's own local breaks (`is_custom: true`) |
| GET | `/spots/{spot_id}/forecast` | Public | Forecast for a spot, looked up by **slug**; another user's local break returns 404 |
| POST | `/spots` | Session + CSRF | Add a local break (`name`, `latitude`, `longitude`, optional `region`). **409** at 3 breaks; **422** ("Unable to retrieve data…") if the point has no nearby wave forecast; **429** after 10 attempts per hour |
| DELETE | `/spots/{spot_id}` | Owner + CSRF | Delete your own local break (204). **409** if an alert still uses it; curated spots and others' breaks return 404 |

### Alerts

| Method | Route | Access | Behavior |
|---|---|---|---|
| POST | `/alerts` | Session + CSRF | Create an alert owned by the current user, on a spot they can see |
| GET | `/alerts` | Session | List the current user's alerts |
| GET | `/alerts/current-matches` | Session | Spots where at least one of the user's active alerts matches the current forecast hour, with those alerts' names; a spot whose forecast fails is skipped |
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
- Every curated spot was checked to return wave, swell, and wind data at its coordinates.
- The marine model's grid is coarse, so nearby breaks (El Porto and Manhattan Beach Pier, for example) can show identical numbers; at that distance the difference isn't meaningful.
- **Checking a new local break:** Open-Meteo snaps any point to the nearest ocean grid cell (about 8 km apart), even from well inland, and reports which cell it used. A new break is accepted only if that cell is within 10 km and has wave data. That rejects points clearly inland (downtown LA, Pasadena), but a point a few km inland can still pass; catching those would need coastline data.

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

- Each email covers one alert and one surf day. It lists the matching hours (the first six, then a count) and the **average wave height, swell period, and wind speed** across those hours. Hours missing a value are left out of that average, and a value missing from every hour shows as N/A.
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

- **Passwords** are hashed with Argon2 and never stored. New passwords must be at least 10 characters, can't be a common password, and can't contain the email's username (length plus a blocklist, following NIST SP 800-63B, rather than symbol rules). Existing passwords still work.
- **Sessions** are signed JWTs (user id, session id, 7-day expiry) in an `HttpOnly`, `SameSite=Lax` cookie, which JavaScript can't read. The `Secure` flag is controlled by `COOKIE_SECURE` and must be on under HTTPS.
- **Server-side revocation:** every login creates a `user_sessions` row, and every request checks that the token's session exists and hasn't been revoked. Logout revokes it, so a copied token stops working immediately, while the user's other devices stay signed in.
- **CSRF protection** uses a signed double-submit token. At login the server also sets a readable `csrf_token` cookie, an HMAC-SHA256 of the session token keyed with the server secret. The frontend sends it back in `X-CSRF-Token` on every change, and middleware rejects mismatches with 403. Because the token is tied to the session, one session's token can't be used with another. `/auth/me` refreshes the cookie, so sessions that existed before CSRF protection keep working.
- **Rate limiting** caps failed logins per email and IP and per IP, and caps registrations per IP (limits in §7). A successful login resets that account's count.
- **Authorization:** every alert route checks both the alert id and the owner, and alerts can only use spots the user can see. Other users' alerts and local breaks return 404.
- **Local break limits:** 3 per user, and 10 add attempts per user per hour, since each attempt calls Open-Meteo and deleting frees a slot.
- **Security log:** the `app.security` logger records registrations, logins, failed logins, rate-limit lockouts, logouts, uses of revoked or unknown sessions, and CSRF rejections, each with the user id or email and the client IP. Passwords and tokens are never logged.

### Limitations and remaining work

- Rate-limit counts are kept in memory, so they reset on restart and only work within a single API process. Several instances would need a shared store such as Redis.
- Behind a reverse proxy, uvicorn must run with `--proxy-headers` and a trusted `--forwarded-allow-ips`, or every visitor looks like the proxy's IP. Locally, every request arrives from `127.0.0.1` through Vite.
- Security logs currently go to the server's console; in production they should go to a log service with retention and alerts.
- There's no "log out everywhere" yet, and changing a password (once that exists) should revoke all of a user's sessions.
- Still to do: HTTPS-only cookies in production, a CORS and proxy review, secrets management, dependency scanning, and limits on public forecast requests.
- Forecast and spot listing routes are public on purpose; anonymous visitors see only curated spots.
- Authorization is enforced in the application; PostgreSQL row-level security isn't used.

---

## 11. Testing

### Automated tests (74 passing)

| File | Covers |
|---|---|
| `conftest.py` | Shared setup: in-memory SQLite database, logged-in test clients that send the CSRF header, rate-limit reset |
| `test_matching.py` | Wave and swell matching, paused alerts, inclusive bounds, grouping by Pacific date |
| `test_forecast.py` | Height conversion, wind alignment, missing wind |
| `test_wind_matching.py` | Wind below, at, and above the limit; missing wind; no limit; paused |
| `test_alert_ownership.py` | Login required; one user can't list, edit, pause, delete, or check another user's alerts |
| `test_alert_history.py` | The owner sees history; other users get 404; login required |
| `test_local_breaks.py` | Breaks are private (other users and anonymous visitors can't see, forecast, use, or delete them); 3-per-user limit; deleting frees a slot; land points rejected; can't delete a break an alert uses; curated spots can't be deleted; add attempts rate-limited |
| `test_notification_email.py` | Email averages for waves, swell period, and wind; missing values skipped or shown as N/A; hour list truncation; HTML escaping |
| `test_current_matches.py` | Only spots where an alert matches the current hour; only the matching alerts listed; paused and other users' alerts ignored; a failed forecast is skipped; login required |
| `test_server.py` | Production entry point: frontend at `/`, assets, API under `/api`, login and CSRF through the prefix, JSON 404s |
| `test_security.py` | Password policy: length, common passwords, email username, existing passwords still log in. CSRF: missing, wrong, and other-session tokens rejected; reads exempt; cookie refresh. Rate limits: lockout, reset on success, per-account, registration. Sessions: logout revokes a copied token, other devices stay signed in, tokens without a valid session id rejected. Security log: events recorded, no passwords or tokens |

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

**Surf spots** (adds any missing spots; safe to rerun)

```bash
cd ~/Projects/surf-alerts/backend && source .venv/bin/activate
python -m app.seed
```

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
| Surf spots | 17 Southern California breaks, search, region grouping | ✅ |
| Local breaks | Up to 3 private breaks per user, on their own page | ✅ |
| Map | Spot map with current conditions, alert-match colors, and Add to alerts | ✅ |
| Design | Portfolio design tokens, light/dark themes, HyperFrames-style motion | ✅ |
| CSRF protection | Signed double-submit token | ✅ |
| Rate limiting | Login and registration limits | ✅ |
| Session hardening | Server-side revocation, security logging | ✅ |
| Deployment | Fly.io app and worker, Neon Postgres, production image | ✅ https://surf-alerts.fly.dev |
| README and demo | Setup guide, screenshots, demo recording | ⬜ |

---

## 14. Roadmap

### Stabilize

- ✅ Database migrations current, with every alert required to have an owner.
- ✅ Tests, lint, and build passing.
- ✅ Alert History showing real stored data, private to each owner.
- ✅ Return to the login page when a session ends mid-visit (any 401 from `apiFetch`).

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
- ✅ Security event logging: logins, failed logins, lockouts, logouts, revoked-session use, CSRF rejections.
- ✅ Server-side session revocation.
- ⬜ Session renewal, "log out everywhere", a password policy, and HTTPS-only cookies.
- ⬜ A check that no secrets are in the repo or the frontend bundle.
- ⬜ Limits on public forecast requests.

### Deploy

- Host the frontend, API, PostgreSQL, and an always-on worker.
- Configure secrets, migrations, HTTPS, routing, and the domain.
- ✅ Confirm the worker runs without my laptop.
- ✅ Verify a Resend sending domain so emails can go to any user (`surf-alerts.ajchaikovsky.com`).
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
7. **Sessions:** cookies, CSRF, and server-side revocation are in place; session renewal isn't yet.
8. **Ownership:** every new alert-related route has to check ownership the same way.
9. **Map tiles:** the map uses OpenStreetMap's public tile server, which is fine for development and light use. A public launch with real traffic should switch to a tile provider with a free tier (OSM's usage policy asks heavy users not to rely on its servers).
10. **Frontend structure:** `Dashboard.tsx` could be split into smaller components, and `api.ts` grown into a typed API client.
11. **Honest labels:** emails are shown as pending, accepted, or failed, never "delivered."

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
- [x] CSRF, rate limiting, secure cookies, and secrets handling are production-ready. *(Secure cookies over HTTPS on Fly; secrets in Fly, never in the repo or image; exposed database password rotated.)*
- [x] Tests, lint, and build pass.
- [x] Migrations run cleanly on an empty database and on one with existing data. *(Fresh database tested in Docker; the local database has run every migration in order.)*
- [ ] The deployment includes the API, frontend, database, always-on worker, logs, backups, and HTTPS.
- [ ] The README covers setup, architecture, limitations, screenshots, and a demo.

---

**Next:** Finish the Fly.io setup steps in the README, then verify the Resend domain and turn on production emails.
