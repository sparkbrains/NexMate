import hashlib
import os
import re
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

RESET_OTP_LENGTH = 6
RESET_OTP_TTL_MINUTES = int(os.getenv("RESET_OTP_TTL_MINUTES", "10"))
RESET_OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("RESET_OTP_RESEND_COOLDOWN_SECONDS", "60"))
RESET_OTP_MAX_ATTEMPTS = int(os.getenv("RESET_OTP_MAX_ATTEMPTS", "5"))


@dataclass(frozen=True)
class User:
    id: int
    email: str
    created_at: str
    name: str = ""
    age: int | None = None
    dob: str | None = None
    motivation: str | None = None
    theme: str | None = None
    subscription_tier: str = "paid"
    reminder_enabled: bool = False
    reminder_time: str = "20:00"
    has_journaled_before: bool | None = None
    onboarding_completed_at: str | None = None


REMINDER_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DOB_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

SUBSCRIPTION_TIERS = {"bronze": "Bronze", "silver": "Silver", "gold": "Gold"}


def _validate_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Name is required")
    if len(cleaned) > 200:
        raise ValueError("Name is too long")
    return cleaned


def _validate_email(email: str) -> str:
    cleaned = email.strip().lower()
    if not cleaned or "@" not in cleaned:
        raise ValueError("Invalid email")
    if len(cleaned) > 320:
        raise ValueError("Email is too long")
    return cleaned


def _validate_dob(value: str) -> str:
    cleaned = value.strip()
    if not DOB_RE.match(cleaned):
        raise ValueError("dob must be in YYYY-MM-DD format")
    try:
        parsed = datetime.strptime(cleaned, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("dob must be a valid date") from exc
    if parsed > _utc_now().date():
        raise ValueError("Date of birth cannot be in the future")
    if parsed.year < 1900:
        raise ValueError("Date of birth is invalid")
    return cleaned


MOTIVATION_MAX_LEN = 300


def _validate_motivation(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) > MOTIVATION_MAX_LEN:
        cleaned = cleaned[:MOTIVATION_MAX_LEN]
    return cleaned


THEMES = {"light", "dark", "playful"}


def _validate_theme(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in THEMES:
        raise ValueError("theme must be 'light', 'dark', or 'playful'")
    return cleaned


def _validate_subscription_tier(tier: str) -> str:
    cleaned = tier.strip().lower()
    if cleaned not in SUBSCRIPTION_TIERS:
        raise ValueError("Plan must be one of: Bronze, Silver, Gold")
    return SUBSCRIPTION_TIERS[cleaned]


def _validate_reminder_time(value: str) -> str:
    cleaned = value.strip()
    if not REMINDER_TIME_RE.match(cleaned):
        raise ValueError("reminder_time must be in HH:MM 24-hour format")
    return cleaned


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
                RETURNING id, created_at, subscription_tier
                """,
                (cleaned_email, password_hash, created_at),
            )
            row = cur.fetchone()
        conn.commit()

    return User(
        id=int(row["id"]),
        email=cleaned_email,
        created_at=row["created_at"].isoformat(),
        subscription_tier=str(row["subscription_tier"]),
    )


def authenticate_user(email: str, password: str) -> User | None:
    cleaned_email = email.strip().lower()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, password_hash, created_at, name, age, dob, motivation, theme, subscription_tier,
                       reminder_enabled, reminder_time, has_journaled_before, onboarding_completed_at
                FROM users WHERE email = %s
                """,
                (cleaned_email,),
            )
            row = cur.fetchone()

    if not row:
        return None
    if not _verify_password(password, str(row["password_hash"])):
        return None
    return User(
        id=int(row["id"]),
        email=str(row["email"]),
        created_at=row["created_at"].isoformat(),
        name=str(row.get("name") or ""),
        age=row.get("age"),
        dob=row["dob"].isoformat() if row.get("dob") else None,
        motivation=row.get("motivation") or None,
        theme=row.get("theme") or None,
        subscription_tier=str(row.get("subscription_tier") or "paid"),
        reminder_enabled=bool(row.get("reminder_enabled") or False),
        reminder_time=str(row.get("reminder_time") or "20:00"),
        has_journaled_before=row.get("has_journaled_before"),
        onboarding_completed_at=row["onboarding_completed_at"].isoformat() if row.get("onboarding_completed_at") else None,
    )


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

    now = _utc_now()
    ttl = timedelta(days=SESSION_TTL_DAYS)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.email, u.created_at, u.name, u.age, u.dob, u.motivation, u.theme, u.subscription_tier,
                       u.reminder_enabled, u.reminder_time, u.has_journaled_before,
                       u.onboarding_completed_at, s.expires_at
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
            if expires_at < now:
                cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
                conn.commit()
                return None

            # Sliding expiry: an actively-used session keeps getting pushed
            # back out to a full TTL from "now", so a user who's still
            # around doesn't get hard-logged-out mid-use. Only write when
            # the session is more than halfway to expiring, so a busy user
            # doesn't cause a DB write on every single request.
            if expires_at - now < ttl / 2:
                new_expires_at = now + ttl
                cur.execute(
                    "UPDATE sessions SET expires_at = %s WHERE token = %s",
                    (new_expires_at, token),
                )
                conn.commit()

    return User(
        id=int(row["id"]),
        email=str(row["email"]),
        created_at=row["created_at"].isoformat(),
        name=str(row.get("name") or ""),
        age=row.get("age"),
        dob=row["dob"].isoformat() if row.get("dob") else None,
        motivation=row.get("motivation") or None,
        theme=row.get("theme") or None,
        subscription_tier=str(row.get("subscription_tier") or "paid"),
        reminder_enabled=bool(row.get("reminder_enabled") or False),
        reminder_time=str(row.get("reminder_time") or "20:00"),
        has_journaled_before=row.get("has_journaled_before"),
        onboarding_completed_at=row["onboarding_completed_at"].isoformat() if row.get("onboarding_completed_at") else None,
    )


def delete_session(token: str) -> None:
    if not token:
        return
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
        conn.commit()


WS_TICKET_TTL_SECONDS = int(os.getenv("WS_TICKET_TTL_SECONDS", "30"))


# --- WebSocket connection tickets ---------------------------------------
#
# Browsers can't attach an Authorization header to a WebSocket handshake,
# so the session token would otherwise have to travel as a `?token=...`
# query param -- which lands in access logs, browser history, and any
# intermediary proxy logs for as long as that (up to SESSION_TTL_DAYS-lived,
# reusable) token is valid. Instead, the client exchanges its real session
# token for a short-lived, single-use ticket over a normal authenticated
# REST call (token stays in the Authorization header), and only the ticket
# -- worthless once consumed or after WS_TICKET_TTL_SECONDS -- goes in the
# WS URL.

def create_ws_ticket(token: str) -> str | None:
    user = get_user_by_token(token)
    if not user:
        return None

    ticket = secrets.token_urlsafe(32)
    now = _utc_now()
    expires_at = now + timedelta(seconds=WS_TICKET_TTL_SECONDS)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ws_tickets (ticket, user_id, session_token, created_at, expires_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (ticket, user.id, token, now, expires_at),
            )
        conn.commit()
    return ticket


def consume_ws_ticket(ticket: str) -> str | None:
    """Single-use: looks up and deletes the ticket in one shot, then returns
    the real session token it was minted from (so the caller can resolve
    the user and revalidate the underlying session for the connection's
    lifetime), or None if the ticket is missing/expired/already used.
    """
    if not ticket:
        return None

    now = _utc_now()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM ws_tickets WHERE ticket = %s RETURNING session_token, expires_at",
                (ticket,),
            )
            row = cur.fetchone()
        conn.commit()

    if not row or row["expires_at"] < now:
        return None
    return str(row["session_token"])


def cleanup_expired_records() -> dict[str, int]:
    """Purges rows that are past their expires_at but were never touched
    again (so the lazy per-lookup deletes in get_user_by_token / the OTP
    flows never ran on them). Meant to be called periodically, not on the
    request path.
    """
    now = _utc_now()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sessions WHERE expires_at < %s", (now,))
            sessions_deleted = cur.rowcount
            cur.execute("DELETE FROM pending_signups WHERE expires_at < %s", (now,))
            pending_signups_deleted = cur.rowcount
            cur.execute("DELETE FROM password_resets WHERE expires_at < %s", (now,))
            password_resets_deleted = cur.rowcount
            cur.execute("DELETE FROM ws_tickets WHERE expires_at < %s", (now,))
            ws_tickets_deleted = cur.rowcount
        conn.commit()
    return {
        "sessions": sessions_deleted,
        "pending_signups": pending_signups_deleted,
        "password_resets": password_resets_deleted,
        "ws_tickets": ws_tickets_deleted,
    }


# --- signup OTP flow ---------------------------------------------------
#
# No row is ever created in `users` until the code is verified. Pending
# signups live in their own table (see db.py) with a hashed OTP and a
# hashed password, and expire on their own even if never verified.

def _generate_otp(length: int = OTP_LENGTH) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


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
                "SELECT password_hash, otp_hash, attempts, expires_at, name, age FROM pending_signups WHERE email = %s",
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
                INSERT INTO users (email, password_hash, created_at, name, age)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, created_at, subscription_tier
                """,
                (cleaned_email, str(row["password_hash"]), now, str(row.get("name") or ""), row.get("age")),
            )
            user_row = cur.fetchone()
            cur.execute("DELETE FROM pending_signups WHERE email = %s", (cleaned_email,))
        conn.commit()

    return User(
        id=int(user_row["id"]),
        email=cleaned_email,
        created_at=user_row["created_at"].isoformat(),
        name=str(row.get("name") or ""),
        age=row.get("age"),
        subscription_tier=str(user_row["subscription_tier"]),
    )


# --- forgot password flow -----------------------------------------------
#
# Three steps: request_password_reset_otp() emails a code to an existing
# user; verify_password_reset_otp() checks the code and marks the pending
# row "verified" (but does NOT touch the password); reset_password()
# re-checks the code and the verified flag before actually updating the
# password, so a stale/replayed request can't slip through after the
# code has expired or been superseded by a newer one. All of the user's
# existing sessions are invalidated once the password is changed.

def _send_password_reset_email(to_email: str, code: str) -> None:
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
        f"Your Nextmate password reset code is {code}.\n\n"
        f"It expires in {RESET_OTP_TTL_MINUTES} minutes. If you didn't request this, "
        f"you can safely ignore this email — your password will not be changed."
    )
    msg["Subject"] = "Reset your Nextmate password"
    msg["From"] = sender
    msg["To"] = to_email

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(sender, [to_email], msg.as_string())


def request_password_reset_otp(email: str) -> None:
    cleaned_email = email.strip().lower()
    if not cleaned_email or "@" not in cleaned_email:
        raise ValueError("Invalid email")

    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (cleaned_email,))
            if not cur.fetchone():
                # Don't reveal whether the email is registered.
                return

            cur.execute(
                "SELECT last_sent_at FROM password_resets WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()
            if row and row["last_sent_at"] + timedelta(seconds=RESET_OTP_RESEND_COOLDOWN_SECONDS) > now:
                raise ValueError("Please wait before requesting another code")

            code = _generate_otp(RESET_OTP_LENGTH)
            otp_hash = _encode_password(code)
            expires_at = now + timedelta(minutes=RESET_OTP_TTL_MINUTES)

            cur.execute(
                """
                INSERT INTO password_resets (email, otp_hash, attempts, verified, expires_at, last_sent_at)
                VALUES (%s, %s, 0, FALSE, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    otp_hash = EXCLUDED.otp_hash,
                    attempts = 0,
                    verified = FALSE,
                    expires_at = EXCLUDED.expires_at,
                    last_sent_at = EXCLUDED.last_sent_at
                """,
                (cleaned_email, otp_hash, expires_at, now),
            )
        conn.commit()

    _send_password_reset_email(cleaned_email, code)


def resend_password_reset_otp(email: str) -> None:
    cleaned_email = email.strip().lower()
    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT last_sent_at FROM password_resets WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("No pending reset for this email. Start again")

            if row["last_sent_at"] + timedelta(seconds=RESET_OTP_RESEND_COOLDOWN_SECONDS) > now:
                raise ValueError("Please wait before requesting another code")

            code = _generate_otp(RESET_OTP_LENGTH)
            otp_hash = _encode_password(code)
            expires_at = now + timedelta(minutes=RESET_OTP_TTL_MINUTES)

            cur.execute(
                """
                UPDATE password_resets
                SET otp_hash = %s, attempts = 0, verified = FALSE, expires_at = %s, last_sent_at = %s
                WHERE email = %s
                """,
                (otp_hash, expires_at, now, cleaned_email),
            )
        conn.commit()

    _send_password_reset_email(cleaned_email, code)


def verify_password_reset_otp(email: str, otp: str) -> None:
    """Checks the code and marks this reset as verified. The password is
    not changed here — the caller should now prompt for a new password
    and call reset_password()."""
    cleaned_email = email.strip().lower()
    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT otp_hash, attempts, expires_at FROM password_resets WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("No pending reset for this email. Start again")

            if row["expires_at"] < now:
                cur.execute("DELETE FROM password_resets WHERE email = %s", (cleaned_email,))
                conn.commit()
                raise ValueError("That code expired. Request a new one")

            if row["attempts"] >= RESET_OTP_MAX_ATTEMPTS:
                cur.execute("DELETE FROM password_resets WHERE email = %s", (cleaned_email,))
                conn.commit()
                raise ValueError("Too many attempts. Request a new code")

            if not _verify_password(otp, str(row["otp_hash"])):
                cur.execute(
                    "UPDATE password_resets SET attempts = attempts + 1 WHERE email = %s",
                    (cleaned_email,),
                )
                conn.commit()
                raise ValueError("That code didn't match")

            cur.execute(
                "UPDATE password_resets SET verified = TRUE WHERE email = %s",
                (cleaned_email,),
            )
        conn.commit()


def reset_password(email: str, otp: str, new_password: str) -> None:
    """Final step: re-checks the OTP and the verified flag, then updates
    the user's password and invalidates all existing sessions for that
    user."""
    cleaned_email = email.strip().lower()
    if len(new_password) < 6:
        raise ValueError("Password must be at least 6 characters")

    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT otp_hash, verified, expires_at FROM password_resets WHERE email = %s",
                (cleaned_email,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("No pending reset for this email. Start again")

            if row["expires_at"] < now:
                cur.execute("DELETE FROM password_resets WHERE email = %s", (cleaned_email,))
                conn.commit()
                raise ValueError("That code expired. Request a new one")

            if not row["verified"]:
                raise ValueError("Verify your code before setting a new password")

            if not _verify_password(otp, str(row["otp_hash"])):
                # Code was rotated/superseded between verify and reset.
                raise ValueError("That code didn't match. Start again")

            cur.execute("SELECT id FROM users WHERE email = %s", (cleaned_email,))
            user_row = cur.fetchone()
            if not user_row:
                cur.execute("DELETE FROM password_resets WHERE email = %s", (cleaned_email,))
                conn.commit()
                raise ValueError("Account not found")

            new_hash = _encode_password(new_password)
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE email = %s",
                (new_hash, cleaned_email),
            )
            cur.execute("DELETE FROM password_resets WHERE email = %s", (cleaned_email,))
            # Invalidate existing sessions so old logins/devices are logged out.
            cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_row["id"],))
        conn.commit()


def change_password(user_id: int, current_password: str, new_password: str) -> None:
    if len(new_password) < 6:
        raise ValueError("Password must be at least 6 characters")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError("Account not found")

            if not _verify_password(current_password, str(row["password_hash"])):
                raise ValueError("Current password is incorrect")

            new_hash = _encode_password(new_password)
            cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user_id))
            cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        conn.commit()


def update_reminder_settings(user_id: int, enabled: bool, reminder_time: str) -> User:
    cleaned_time = _validate_reminder_time(reminder_time)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE users SET reminder_enabled = %s, reminder_time = %s
                WHERE id = %s
                RETURNING id, email, created_at, name, age, dob, motivation, theme, subscription_tier,
                          reminder_enabled, reminder_time, has_journaled_before, onboarding_completed_at
                """,
                (bool(enabled), cleaned_time, user_id),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("Account not found")
        conn.commit()

    return User(
        id=int(row["id"]),
        email=str(row["email"]),
        created_at=row["created_at"].isoformat(),
        name=str(row.get("name") or ""),
        age=row.get("age"),
        dob=row["dob"].isoformat() if row.get("dob") else None,
        motivation=row.get("motivation") or None,
        theme=row.get("theme") or None,
        subscription_tier=str(row.get("subscription_tier") or "paid"),
        reminder_enabled=bool(row.get("reminder_enabled") or False),
        reminder_time=str(row.get("reminder_time") or "20:00"),
        has_journaled_before=row.get("has_journaled_before"),
        onboarding_completed_at=row["onboarding_completed_at"].isoformat() if row.get("onboarding_completed_at") else None,
    )


def update_profile(
    user_id: int,
    name: str,
    email: str,
    dob: str | None,
    motivation: str | None,
    theme: str | None,
    subscription_tier: str | None,
) -> User:
    # Name is validated (non-empty, length) only when one is actually being
    # set — it's no longer collected at signup, so a profile patch that's
    # only touching dob (with name defaulted from an as-yet-unset current
    # value) shouldn't be blocked on a name that isn't part of this request.
    cleaned_name = _validate_name(name) if name and name.strip() else ""
    cleaned_email = _validate_email(email)
    cleaned_dob = _validate_dob(dob) if dob else None
    # Same idea for motivation: an empty/omitted value just leaves whatever
    # is already stored untouched rather than blanking it out.
    cleaned_motivation = _validate_motivation(motivation) if motivation and motivation.strip() else None
    # Same idea for theme: an empty/omitted value leaves whatever's already
    # stored untouched instead of resetting the account to no preference.
    cleaned_theme = _validate_theme(theme) if theme else None
    # Same idea for subscription_tier: only validate/change it when the
    # caller explicitly provided one, so a name- or dob-only patch doesn't
    # need to round-trip (and revalidate) whatever tier is already stored.
    cleaned_tier = _validate_subscription_tier(subscription_tier) if subscription_tier else None

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (cleaned_email, user_id))
            if cur.fetchone():
                raise ValueError("Email already registered")

            cur.execute(
                """
                UPDATE users SET name = %s, email = %s, dob = %s, motivation = %s, theme = %s,
                       subscription_tier = COALESCE(%s, subscription_tier)
                WHERE id = %s
                RETURNING id, email, created_at, name, age, dob, motivation, theme, subscription_tier,
                          reminder_enabled, reminder_time, has_journaled_before, onboarding_completed_at
                """,
                (cleaned_name, cleaned_email, cleaned_dob, cleaned_motivation, cleaned_theme, cleaned_tier, user_id),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("Account not found")
        conn.commit()

    return User(
        id=int(row["id"]),
        email=str(row["email"]),
        created_at=row["created_at"].isoformat(),
        name=str(row.get("name") or ""),
        age=row.get("age"),
        dob=row["dob"].isoformat() if row.get("dob") else None,
        motivation=row.get("motivation") or None,
        theme=row.get("theme") or None,
        subscription_tier=str(row.get("subscription_tier") or "paid"),
        reminder_enabled=bool(row.get("reminder_enabled") or False),
        reminder_time=str(row.get("reminder_time") or "20:00"),
        has_journaled_before=row.get("has_journaled_before"),
        onboarding_completed_at=row["onboarding_completed_at"].isoformat() if row.get("onboarding_completed_at") else None,
    )


def complete_onboarding(user_id: int, has_journaled_before: bool | None) -> User:
    now = _utc_now()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE users SET has_journaled_before = %s, onboarding_completed_at = %s
                WHERE id = %s
                RETURNING id, email, created_at, name, age, dob, motivation, theme, subscription_tier,
                          reminder_enabled, reminder_time, has_journaled_before, onboarding_completed_at
                """,
                (has_journaled_before, now, user_id),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("Account not found")
        conn.commit()

    return User(
        id=int(row["id"]),
        email=str(row["email"]),
        created_at=row["created_at"].isoformat(),
        name=str(row.get("name") or ""),
        age=row.get("age"),
        dob=row["dob"].isoformat() if row.get("dob") else None,
        motivation=row.get("motivation") or None,
        theme=row.get("theme") or None,
        subscription_tier=str(row.get("subscription_tier") or "paid"),
        reminder_enabled=bool(row.get("reminder_enabled") or False),
        reminder_time=str(row.get("reminder_time") or "20:00"),
        has_journaled_before=row.get("has_journaled_before"),
        onboarding_completed_at=row["onboarding_completed_at"].isoformat() if row.get("onboarding_completed_at") else None,
    )


def delete_user(user_id: int, password: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError("Account not found")

            if not _verify_password(password, str(row["password_hash"])):
                raise ValueError("Password is incorrect")

            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()


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