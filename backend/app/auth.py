import hashlib
import hmac
import logging
import math
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserSession


# -------- CONFIGURATION --------

load_dotenv(
    Path(__file__).resolve().parents[1] / ".env"
)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY or len(JWT_SECRET_KEY) < 32:
    raise RuntimeError(
        "Set a strong JWT_SECRET_KEY in backend/.env"
    )

JWT_ALGORITHM = "HS256"

# Security events: logins, lockouts, revoked sessions, CSRF rejections.
# Never log passwords or tokens.
security_log = logging.getLogger("app.security")

COOKIE_NAME = "surf_session"

# Readable by the frontend, which echoes it back in a header.
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"

# No session exists yet when these are called.
CSRF_EXEMPT_PATHS = {"/auth/login", "/auth/register"}

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Failed logins per email + IP, and per IP across all emails.
LOGIN_MAX_FAILURES = 5
LOGIN_MAX_FAILURES_PER_IP = 20
LOGIN_WINDOW_SECONDS = 15 * 60

REGISTER_MAX_ATTEMPTS = 10
REGISTER_WINDOW_SECONDS = 60 * 60

SESSION_DAYS = 7

COOKIE_SECURE = (
    os.getenv("COOKIE_SECURE", "false").lower() == "true"
)

password_hash = PasswordHash.recommended()

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


# -------- REQUEST AND RESPONSE SCHEMAS --------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=128
    )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)


# -------- AUTHENTICATION HELPERS --------

def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_session_token(db: Session, user_id: int) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=SESSION_DAYS)

    # Each login gets its own row, so logging out on one
    # device revokes only that session.
    session_id = secrets.token_urlsafe(32)

    # Drop this user's expired sessions while we're here.
    db.execute(
        delete(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.expires_at < now
        )
    )

    db.add(
        UserSession(
            id=session_id,
            user_id=user_id,
            expires_at=expires_at
        )
    )
    db.commit()

    payload = {
        "sub": str(user_id),
        "jti": session_id,
        "exp": expires_at,
        "type": "session"
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )


def decode_session_token(token: str) -> tuple[int, str]:
    """Return (user_id, session_id), or raise ValueError."""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM]
        )

        if payload.get("type") != "session":
            raise ValueError("Invalid token type")

        return int(payload["sub"]), str(payload["jti"])

    except (
        jwt.InvalidTokenError,
        KeyError,
        TypeError,
    ) as exc:
        raise ValueError("Invalid session token") from exc


def csrf_token_for(session_token: str) -> str:
    # Signed double-submit: the CSRF token is derived from
    # the session, so it can't be reused with another session.
    return hmac.new(
        JWT_SECRET_KEY.encode(),
        session_token.encode(),
        hashlib.sha256
    ).hexdigest()


def set_csrf_cookie(
    response: Response,
    session_token: str
):
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token_for(session_token),
        httponly=False,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/"
    )


def set_session_cookie(
    response: Response,
    db: Session,
    user_id: int
):
    token = create_session_token(db, user_id)

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/"
    )

    set_csrf_cookie(response, token)


def csrf_is_valid(request: Request) -> bool:
    if request.method not in UNSAFE_METHODS:
        return True

    if request.url.path in CSRF_EXEMPT_PATHS:
        return True

    session_token = request.cookies.get(COOKIE_NAME)

    # Without a session the endpoint itself returns 401.
    if not session_token:
        return True

    sent_token = request.headers.get(CSRF_HEADER_NAME, "")

    return hmac.compare_digest(
        sent_token,
        csrf_token_for(session_token)
    )


# -------- RATE LIMITING --------
# In-memory, so limits are per API process. Multiple
# instances in production would need a shared store.

_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempts_lock = threading.Lock()


def _recent_attempts(key: str, window: int) -> deque[float]:
    attempts = _attempts[key]
    cutoff = time.monotonic() - window

    while attempts and attempts[0] < cutoff:
        attempts.popleft()

    return attempts


def check_rate_limit(key: str, limit: int, window: int):
    with _attempts_lock:
        attempts = _recent_attempts(key, window)

        if len(attempts) < limit:
            return

        retry_after = attempts[0] + window - time.monotonic()

    security_log.warning("rate_limited key=%s", key)

    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many attempts. Please try again later.",
        headers={"Retry-After": str(max(1, math.ceil(retry_after)))}
    )


def record_attempt(key: str):
    with _attempts_lock:
        _attempts[key].append(time.monotonic())


def clear_attempts(key: str):
    with _attempts_lock:
        _attempts.pop(key, None)


def reset_rate_limits():
    with _attempts_lock:
        _attempts.clear()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def get_current_user(
    request: Request,
    token: str | None = Cookie(
        default=None,
        alias=COOKIE_NAME
    ),
    db: Session = Depends(get_db)
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    try:
        user_id, session_id = decode_session_token(token)

    except ValueError:
        # Expired, tampered with, or issued before
        # server-side sessions existed.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )

    # A signed token is only valid while its session row
    # exists and hasn't been revoked by logout.
    session = db.get(UserSession, session_id)

    if (
        session is None
        or session.revoked_at is not None
        or session.user_id != user_id
    ):
        security_log.warning(
            "revoked_session_used user_id=%s ip=%s",
            user_id,
            client_ip(request)
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or revoked"
        )

    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user


# -------- REGISTER --------

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201
)
def register(
    account: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    register_key = f"register:{client_ip(request)}"

    check_rate_limit(
        register_key,
        REGISTER_MAX_ATTEMPTS,
        REGISTER_WINDOW_SECONDS
    )
    record_attempt(register_key)

    email = normalize_email(str(account.email))

    existing = db.scalar(
        select(User).where(User.email == email)
    )

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Email already registered"
        )

    new_user = User(
        email=email,
        password_hash=password_hash.hash(
            account.password
        )
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email already registered"
        )

    set_session_cookie(response, db, new_user.id)

    security_log.info(
        "registered user_id=%s ip=%s",
        new_user.id,
        client_ip(request)
    )

    return new_user


# -------- LOGIN --------

@router.post(
    "/login",
    response_model=UserResponse
)
def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    email = normalize_email(
        str(credentials.email)
    )

    ip = client_ip(request)
    account_key = f"login:{ip}:{email}"
    ip_key = f"login-ip:{ip}"

    check_rate_limit(
        account_key,
        LOGIN_MAX_FAILURES,
        LOGIN_WINDOW_SECONDS
    )
    check_rate_limit(
        ip_key,
        LOGIN_MAX_FAILURES_PER_IP,
        LOGIN_WINDOW_SECONDS
    )

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if (
        user is None
        or not password_hash.verify(
            credentials.password,
            user.password_hash
        )
    ):
        record_attempt(account_key)
        record_attempt(ip_key)

        security_log.warning(
            "login_failed email=%s ip=%s",
            email,
            ip
        )

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    clear_attempts(account_key)

    set_session_cookie(response, db, user.id)

    security_log.info(
        "login user_id=%s ip=%s",
        user.id,
        ip
    )

    return user


# -------- CURRENT USER --------

@router.get(
    "/me",
    response_model=UserResponse
)
def get_me(
    response: Response,
    token: str = Cookie(alias=COOKIE_NAME),
    current_user: User = Depends(get_current_user)
):
    # Issue a CSRF cookie to sessions created before
    # CSRF protection existed.
    set_csrf_cookie(response, token)

    return current_user


# -------- LOGOUT --------

@router.post("/logout")
def logout(
    response: Response,
    token: str | None = Cookie(
        default=None,
        alias=COOKIE_NAME
    ),
    db: Session = Depends(get_db)
):
    # Revoke the session server-side, so a copied token
    # stops working even though it hasn't expired.
    if token:
        try:
            user_id, session_id = decode_session_token(token)

        except ValueError:
            user_id, session_id = None, None

        session = (
            db.get(UserSession, session_id)
            if session_id
            else None
        )

        if session is not None and session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()

            security_log.info("logout user_id=%s", user_id)

    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite="lax"
    )

    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        samesite="lax"
    )

    return {"message": "Logged out successfully"}
