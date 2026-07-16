import hashlib
import os
import secrets
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from typing import Iterable

from apps.db import get_connection, init_postgres


SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "30"))
DEFAULT_LOCAL_DUMMY_USERS = "demo@nextmate.local:demo123,qa@nextmate.local:demo123"

OTP_LENGTH = 6
OTP_TTL_MINUTES = int(os.getenv("SIGNUP_OTP_TTL_MINUTES", "10"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("SIGNUP_OTP_RESEND_COOLDOWN_SECONDS", "60"))
OTP_MAX_ATTEMPTS = int(os.getenv("SIGNUP_OTP_MAX_ATTEMPTS", "5"))


@dataclass(frozen=True)
class User:
    id: int
    email: str
    created_at: str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def init_auth_db() -> None:
    init_postgres()


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        120000,
    )
    return digest.hex()


def _encode_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = _hash_password(password, salt)
    return f"{salt}${digest}"


def _verify_password(password: str, encoded: str) -> bool:
    if "$" not in encoded:
        return False
    salt, expected = encoded.split("$", 1)
    actual = _hash_password(password, salt)
    return secrets.compare_digest(actual, expected)


def create_user(email: str, password: str) -> User:
    cleaned_email = email.strip().lower()
    if not cleaned_email or "@" not in cleaned_email:
        raise ValueError("Invalid email")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")

    created_at = _utc_now()
    password_hash = _encode_password(password)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (cleaned_email,))
            if cur.fetchone():
                raise ValueError("Email already registered")

            cur.execute(
                """
                INSERT INTO users (email, password_hash, created_at)
                VALUES (%s, %s, %s)
                RETURNING id, created_at
                """,
                (cleaned_email, password_hash, created_at),
            )
            row = cur.fetchone()
        conn.commit()

    return User(id=int(row["id"]), email=cleaned_email, created_at=row["created_at"].isoformat())


def authenticate_user(email: str, password: str) -> User | None:
    cleaned_email = email.strip().lower()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, password_hash, created_at FROM users WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()

    if not row:
        return None
    if not _verify_password(password, str(row["password_hash"])):
        return None
    return User(id=int(row["id"]), email=str(row["email"]), created_at=row["created_at"].isoformat())


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = _utc_now()
    expires_at = now + timedelta(days=SESSION_TTL_DAYS)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sessions (token, user_id, created_at, expires_at)
                VALUES (%s, %s, %s, %s)
                """,
                (token, user_id, now, expires_at),
            )
        conn.commit()
    return token


def get_user_by_token(token: str) -> User | None:
    if not token:
        return None

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.email, u.created_at, s.expires_at
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = %s
                """,
                (token,),
            )
            row = cur.fetchone()
            if not row:
                return None

            expires_at = row["expires_at"]
            if expires_at < _utc_now():
                cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
                conn.commit()
                return None

    return User(id=int(row["id"]), email=str(row["email"]), created_at=row["created_at"].isoformat())


def delete_session(token: str) -> None:
    if not token:
        return
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
        conn.commit()


# --- signup OTP flow ---------------------------------------------------
#
# No row is ever created in `users` until the code is verified. Pending
# signups live in their own table (see db.py) with a hashed OTP and a
# hashed password, and expire on their own even if never verified.

def _generate_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def _send_otp_email(to_email: str, code: str) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        raise EnvironmentError("SMTP_HOST environment variable is required for sending OTP emails.")
    port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    if not smtp_user:
        raise EnvironmentError("SMTP_USER environment variable is required for sending OTP emails.")
    smtp_password = os.getenv("SMTP_PASSWORD")
    if not smtp_password:
        raise EnvironmentError("SMTP_PASSWORD environment variable is required for sending OTP emails.")
    sender = os.getenv("SMTP_FROM", smtp_user)

    msg = MIMEText(
        f"Your Nextmate verification code is {code}.\n\n"
        f"It expires in {OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email."
    )
    msg["Subject"] = "Your Nextmate verification code"
    msg["From"] = sender
    msg["To"] = to_email

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(sender, [to_email], msg.as_string())


def request_signup_otp(email: str, password: str) -> None:
    cleaned_email = email.strip().lower()
    if not cleaned_email or "@" not in cleaned_email:
        raise ValueError("Invalid email")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")

    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (cleaned_email,))
            if cur.fetchone():
                raise ValueError("Email already registered")

            cur.execute(
                "SELECT last_sent_at FROM pending_signups WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()
            if row and row["last_sent_at"] + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS) > now:
                raise ValueError("Please wait before requesting another code")

            code = _generate_otp()
            otp_hash = _encode_password(code)
            password_hash = _encode_password(password)
            expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)

            cur.execute(
                """
                INSERT INTO pending_signups (email, password_hash, otp_hash, attempts, expires_at, last_sent_at)
                VALUES (%s, %s, %s, 0, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    password_hash = EXCLUDED.password_hash,
                    otp_hash = EXCLUDED.otp_hash,
                    attempts = 0,
                    expires_at = EXCLUDED.expires_at,
                    last_sent_at = EXCLUDED.last_sent_at
                """,
                (cleaned_email, password_hash, otp_hash, expires_at, now),
            )
        conn.commit()

    _send_otp_email(cleaned_email, code)


def resend_signup_otp(email: str) -> None:
    cleaned_email = email.strip().lower()
    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT last_sent_at FROM pending_signups WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("No pending signup for this email. Start again")

            if row["last_sent_at"] + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS) > now:
                raise ValueError("Please wait before requesting another code")

            code = _generate_otp()
            otp_hash = _encode_password(code)
            expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)

            cur.execute(
                """
                UPDATE pending_signups
                SET otp_hash = %s, attempts = 0, expires_at = %s, last_sent_at = %s
                WHERE email = %s
                """,
                (otp_hash, expires_at, now, cleaned_email),
            )
        conn.commit()

    _send_otp_email(cleaned_email, code)


def verify_signup_otp(email: str, otp: str) -> User:
    cleaned_email = email.strip().lower()
    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash, otp_hash, attempts, expires_at FROM pending_signups WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("No pending signup for this email. Start again")

            if row["expires_at"] < now:
                cur.execute("DELETE FROM pending_signups WHERE email = %s", (cleaned_email,))
                conn.commit()
                raise ValueError("That code expired. Request a new one")

            if row["attempts"] >= OTP_MAX_ATTEMPTS:
                cur.execute("DELETE FROM pending_signups WHERE email = %s", (cleaned_email,))
                conn.commit()
                raise ValueError("Too many attempts. Request a new code")

            if not _verify_password(otp, str(row["otp_hash"])):
                cur.execute(
                    "UPDATE pending_signups SET attempts = attempts + 1 WHERE email = %s",
                    (cleaned_email,),
                )
                conn.commit()
                raise ValueError("That code didn't match")

            # Code is correct — create the real account and clean up.
            cur.execute("SELECT id FROM users WHERE email = %s", (cleaned_email,))
            if cur.fetchone():
                cur.execute("DELETE FROM pending_signups WHERE email = %s", (cleaned_email,))
                conn.commit()
                raise ValueError("Email already registered")

            cur.execute(
                """
                INSERT INTO users (email, password_hash, created_at)
                VALUES (%s, %s, %s)
                RETURNING id, created_at
                """,
                (cleaned_email, str(row["password_hash"]), now),
            )
            user_row = cur.fetchone()
            cur.execute("DELETE FROM pending_signups WHERE email = %s", (cleaned_email,))
        conn.commit()

    return User(
        id=int(user_row["id"]),
        email=cleaned_email,
        created_at=user_row["created_at"].isoformat(),
    )


def _parse_dummy_users(raw: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for token in raw.split(","):
        token = token.strip()
        if not token or ":" not in token:
            continue
        email, password = token.split(":", 1)
        email = email.strip().lower()
        password = password.strip()
        if not email or not password:
            continue
        pairs.append((email, password))
    return pairs


def _truthy(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def seed_dummy_users(users: Iterable[tuple[str, str]]) -> dict[str, int]:
    seeded = 0
    skipped = 0
    for email, password in users:
        try:
            create_user(email=email, password=password)
            seeded += 1
        except ValueError:
            skipped += 1
    return {"seeded": seeded, "skipped": skipped}


def seed_dummy_users_from_env() -> dict[str, int]:
    app_env = os.getenv("APP_ENV", "local").strip().lower() or "local"
    seed_default = app_env == "local"
    should_seed = _truthy(os.getenv("SEED_DUMMY_USERS"), default=seed_default)
    if not should_seed:
        return {"seeded": 0, "skipped": 0}

    raw = os.getenv("DUMMY_USERS", DEFAULT_LOCAL_DUMMY_USERS if app_env == "local" else "")
    users = _parse_dummy_users(raw)
    if not users:
        return {"seeded": 0, "skipped": 0}
    return seed_dummy_users(users)