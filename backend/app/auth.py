import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Response,
    status,
)
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User


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

COOKIE_NAME = "surf_session"

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


def create_session_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=SESSION_DAYS
    )

    payload = {
        "sub": str(user_id),
        "exp": expires_at,
        "type": "session"
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )


def set_session_cookie(
    response: Response,
    user_id: int
):
    token = create_session_token(user_id)

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/"
    )


def get_current_user(
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
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM]
        )

        if payload.get("type") != "session":
            raise ValueError("Invalid token type")

        user_id = int(payload["sub"])

    except (
        jwt.InvalidTokenError,
        KeyError,
        TypeError,
        ValueError,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
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
    response: Response,
    db: Session = Depends(get_db)
):
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

    set_session_cookie(response, new_user.id)

    return new_user


# -------- LOGIN --------

@router.post(
    "/login",
    response_model=UserResponse
)
def login(
    credentials: LoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    email = normalize_email(
        str(credentials.email)
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
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    set_session_cookie(response, user.id)

    return user


# -------- CURRENT USER --------

@router.get(
    "/me",
    response_model=UserResponse
)
def get_me(
    current_user: User = Depends(get_current_user)
):
    return current_user


# -------- LOGOUT --------

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite="lax"
    )

    return {"message": "Logged out successfully"}
