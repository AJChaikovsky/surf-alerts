import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient

from app.auth import (
    COOKIE_NAME,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    LOGIN_MAX_FAILURES,
    REGISTER_MAX_ATTEMPTS,
)
from app.main import app


ALERT = {
    "name": "CSRF Test",
    "spot_id": 1,
    "min_wave_height_ft": 3.0,
    "max_wave_height_ft": 6.0,
    "min_swell_period_s": 12.0
}


# -------- CSRF --------

def test_state_change_without_csrf_header_is_rejected(make_user_client):
    client = make_user_client("csrf@example.com")
    del client.headers[CSRF_HEADER_NAME]

    response = client.post("/alerts", json=ALERT)

    assert response.status_code == 403
    assert client.get("/alerts").json() == []


def test_state_change_with_wrong_csrf_token_is_rejected(make_user_client):
    client = make_user_client("csrf@example.com")
    client.headers[CSRF_HEADER_NAME] = "not-the-real-token"

    assert client.post("/alerts", json=ALERT).status_code == 403


def test_csrf_token_from_another_session_is_rejected(make_user_client):
    victim = make_user_client("victim@example.com")
    attacker = make_user_client("attacker@example.com")

    # A valid token for one session can't be replayed on another.
    victim.headers[CSRF_HEADER_NAME] = attacker.cookies[CSRF_COOKIE_NAME]

    assert victim.post("/alerts", json=ALERT).status_code == 403


def test_state_change_with_csrf_token_succeeds(make_user_client):
    client = make_user_client("csrf@example.com")

    assert client.post("/alerts", json=ALERT).status_code == 201


def test_reads_do_not_need_csrf_token(make_user_client):
    client = make_user_client("csrf@example.com")
    del client.headers[CSRF_HEADER_NAME]

    assert client.get("/alerts").status_code == 200


def test_me_issues_csrf_cookie_for_existing_session(make_user_client):
    client = make_user_client("csrf@example.com")
    del client.cookies[CSRF_COOKIE_NAME]

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert client.cookies[CSRF_COOKIE_NAME] == client.headers[CSRF_HEADER_NAME]


def test_logout_requires_csrf_and_clears_cookies(make_user_client):
    client = make_user_client("csrf@example.com")
    token = client.headers.pop(CSRF_HEADER_NAME)

    assert client.post("/auth/logout").status_code == 403

    client.headers[CSRF_HEADER_NAME] = token

    assert client.post("/auth/logout").status_code == 200
    assert CSRF_COOKIE_NAME not in client.cookies


# -------- RATE LIMITING --------

def login(client: TestClient, email: str, password: str):
    return client.post(
        "/auth/login",
        json={"email": email, "password": password}
    )


def test_login_locks_after_repeated_failures(make_user_client):
    make_user_client("locked@example.com")
    client = TestClient(app)

    for _ in range(LOGIN_MAX_FAILURES):
        assert login(client, "locked@example.com", "wrong-pass").status_code == 401

    response = login(client, "locked@example.com", "password123")

    # Even the correct password is refused until the window passes.
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0


def test_successful_login_resets_failure_count(make_user_client):
    make_user_client("reset@example.com")
    client = TestClient(app)

    for _ in range(LOGIN_MAX_FAILURES - 1):
        login(client, "reset@example.com", "wrong-pass")

    assert login(client, "reset@example.com", "password123").status_code == 200

    for _ in range(LOGIN_MAX_FAILURES - 1):
        assert login(client, "reset@example.com", "wrong-pass").status_code == 401


def test_lockout_is_per_account(make_user_client):
    make_user_client("one@example.com")
    make_user_client("two@example.com")
    client = TestClient(app)

    for _ in range(LOGIN_MAX_FAILURES):
        login(client, "one@example.com", "wrong-pass")

    assert login(client, "two@example.com", "password123").status_code == 200


def test_registration_is_rate_limited(db_session_factory):
    client = TestClient(app)

    for number in range(REGISTER_MAX_ATTEMPTS):
        client.post(
            "/auth/register",
            json={
                "email": f"user{number}@example.com",
                "password": "password123"
            }
        )

    response = client.post(
        "/auth/register",
        json={"email": "one-more@example.com", "password": "password123"}
    )

    assert response.status_code == 429


# -------- SERVER-SIDE SESSIONS --------

def client_with_session(token: str) -> TestClient:
    client = TestClient(app)
    client.cookies.set(COOKIE_NAME, token)
    return client


def test_logout_revokes_the_session_token(make_user_client):
    client = make_user_client("revoke@example.com")
    stolen_token = client.cookies[COOKIE_NAME]

    assert client.post("/auth/logout").status_code == 200

    # A copy of the token taken before logout no longer works.
    attacker = client_with_session(stolen_token)

    assert attacker.get("/auth/me").status_code == 401
    assert attacker.get("/alerts").status_code == 401


def test_logout_only_revokes_that_device(make_user_client):
    laptop = make_user_client("devices@example.com")

    phone = TestClient(app)
    login(phone, "devices@example.com", "password123")

    phone.headers[CSRF_HEADER_NAME] = phone.cookies[CSRF_COOKIE_NAME]
    assert phone.post("/auth/logout").status_code == 200

    assert laptop.get("/auth/me").status_code == 200


def test_token_without_session_id_is_rejected(make_user_client):
    make_user_client("legacy@example.com")

    # Same shape as tokens issued before server-side sessions.
    legacy_token = jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) + timedelta(days=1),
            "type": "session",
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )

    assert client_with_session(legacy_token).get("/auth/me").status_code == 401


def test_token_with_unknown_session_id_is_rejected(make_user_client):
    make_user_client("forged@example.com")

    forged_token = jwt.encode(
        {
            "sub": "1",
            "jti": "not-a-real-session",
            "exp": datetime.now(timezone.utc) + timedelta(days=1),
            "type": "session",
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )

    assert client_with_session(forged_token).get("/auth/me").status_code == 401


# -------- SECURITY LOG --------

def test_security_events_are_logged(make_user_client, caplog):
    caplog.set_level(logging.INFO, logger="app.security")

    client = make_user_client("logged@example.com")
    login(TestClient(app), "logged@example.com", "wrong-pass")

    token = client.headers.pop(CSRF_HEADER_NAME)
    client.post("/alerts", json=ALERT)

    client.headers[CSRF_HEADER_NAME] = token
    client.post("/auth/logout")

    messages = [
        record.getMessage()
        for record in caplog.records
        if record.name == "app.security"
    ]

    assert any(m.startswith("registered user_id=") for m in messages)
    assert any(m.startswith("login_failed email=logged@example.com") for m in messages)
    assert any(m.startswith("csrf_rejected method=POST path=/alerts") for m in messages)
    assert any(m.startswith("logout user_id=") for m in messages)

    # Passwords and tokens never appear in the log.
    assert not any("wrong-pass" in m or "password123" in m for m in messages)
    assert not any(token in m for m in messages)
