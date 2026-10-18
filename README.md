# Surf Alerts

Surf Alerts watches surf forecasts for me. I pick a break, describe the conditions I want (wave height, swell period, and wind), and it emails me when the forecast matches, at most once per alert per day.

- 17 curated Southern California breaks, plus up to 3 private local breaks per user
- A map with each spot's current conditions, with spots that match my alerts shown in green
- A background worker that checks every active alert every 30 minutes
- Per-account alerts and history, with cookie sessions, CSRF protection, rate limiting, and server-side logout

**Stack:** React + TypeScript + Vite · FastAPI · PostgreSQL · SQLAlchemy + Alembic · APScheduler · Open-Meteo · Resend · Leaflet

The full specification, status, and roadmap are in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

---

## Running it locally

Requirements: macOS with Homebrew, PostgreSQL 17, Python 3.12, and Node.

**1. Database** (starts automatically if it's a Homebrew service)

```bash
brew services start postgresql@17
```

**2. Backend: first time only**

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`backend/.env` is local only and never committed. It needs these variables:

```dotenv
DATABASE_URL=postgresql+psycopg:///surf_alerts
JWT_SECRET_KEY=<random secret, at least 32 characters>
COOKIE_SECURE=false
RESEND_API_KEY=<from resend.com>
EMAIL_FROM=Surf Alerts <onboarding@resend.dev>
TEST_EMAIL_TO=<an address for email.py's standalone test>
EMAIL_NOTIFICATIONS_ENABLED=false
MAX_EMAILS_PER_CHECK=1
```

**3. Backend: every time** (in its own terminal)

```bash
cd backend
source .venv/bin/activate
alembic upgrade head      # apply any new migrations
python -m app.seed        # sync the curated surf spots; safe to rerun
uvicorn app.main:app --reload
```

**4. Frontend** (in a second terminal)

```bash
cd frontend
npm install               # first time, or after dependencies change
npm run dev
```

Open the address Vite prints, usually http://localhost:5173.

**5. Worker** (optional, in a third terminal)

```bash
cd backend
source .venv/bin/activate
python -m app.worker
```

With `EMAIL_NOTIFICATIONS_ENABLED=false` the worker only logs `DRY RUN` lines; with `true` it sends real emails.

## Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/ -v
cd frontend && npm run lint && npm run build
```

The backend tests use an in-memory database and never call Open-Meteo or Resend.
