"""
OTP-verified signup endpoints for NextMate.

Assumes you already have, elsewhere in your FastAPI app:
  - a `User` model / table
  - `hash_password(password) -> str` and `verify_password(plain, hashed) -> bool`
  - `create_access_token(user) -> str` (or however you issue your session token)
  - a SQLAlchemy `get_db()` dependency

Wire this router in with: app.include_router(router, prefix="/auth")

ENV VARS expected (any SMTP provider works — Gmail app password, SES SMTP,
Mailgun SMTP, Resend SMTP, etc.):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
"""

import os
import random
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import Session

from .db import Base, get_db  # adjust import to your project layout
from .auth_utils import hash_password, create_access_token  # adjust to your project
from .models import User  # adjust to your project

router = APIRouter()

OTP_LENGTH = 6
OTP_TTL_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5


# --- storage for pending signups -------------------------------------------
# A dedicated table (rather than the User table) so no account exists until
# the code is verified. Swap this for a Redis TTL key if you'd rather not
# touch Postgres for something this short-lived.

class PendingSignup(Base):
    __tablename__ = "pending_signups"

    email = Column(String, primary_key=True)
    password_hash = Column(String, nullable=False)
    otp_hash = Column(String, nullable=False)
    attempts = Column(Integer, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_sent_at = Column(DateTime(timezone=True), nullable=False)


# --- schemas -----------------------------------------------------------------

class RequestOtpIn(BaseModel):
    email: EmailStr
    password: str


class VerifyOtpIn(BaseModel):
    email: EmailStr
    otp: str


class ResendOtpIn(BaseModel):
    email: EmailStr


# --- helpers -------------------------------------------------------------

def _generate_otp() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(OTP_LENGTH))


def _send_otp_email(to_email: str, code: str):
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    sender = os.environ.get("SMTP_FROM", user)

    msg = MIMEText(
        f"Your Nextmate verification code is {code}. "
        f"It expires in {OTP_TTL_MINUTES} minutes."
    )
    msg["Subject"] = "Your Nextmate verification code"
    msg["From"] = sender
    msg["To"] = to_email

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(sender, [to_email], msg.as_string())


# --- endpoints -------------------------------------------------------------

@router.post("/signup/request-otp")
def request_otp(body: RequestOtpIn, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == body.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    now = datetime.now(timezone.utc)
    pending = db.query(PendingSignup).filter(PendingSignup.email == body.email).first()

    if pending and pending.last_sent_at + timedelta(seconds=RESEND_COOLDOWN_SECONDS) > now:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code.")

    code = _generate_otp()

    if pending is None:
        pending = PendingSignup(email=body.email)
        db.add(pending)

    pending.password_hash = hash_password(body.password)
    pending.otp_hash = hash_password(code)  # reuse your existing hasher for the OTP too
    pending.attempts = 0
    pending.expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    pending.last_sent_at = now
    db.commit()

    _send_otp_email(body.email, code)
    return {"message": "Code sent."}


@router.post("/signup/resend-otp")
def resend_otp(body: ResendOtpIn, db: Session = Depends(get_db)):
    pending = db.query(PendingSignup).filter(PendingSignup.email == body.email).first()
    if not pending:
        raise HTTPException(status_code=404, detail="No pending signup for this email. Start again.")

    now = datetime.now(timezone.utc)
    if pending.last_sent_at + timedelta(seconds=RESEND_COOLDOWN_SECONDS) > now:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code.")

    code = _generate_otp()
    pending.otp_hash = hash_password(code)
    pending.attempts = 0
    pending.expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    pending.last_sent_at = now
    db.commit()

    _send_otp_email(body.email, code)
    return {"message": "Code resent."}


@router.post("/signup/verify-otp")
def verify_otp(body: VerifyOtpIn, db: Session = Depends(get_db)):
    pending = db.query(PendingSignup).filter(PendingSignup.email == body.email).first()
    if not pending:
        raise HTTPException(status_code=404, detail="No pending signup for this email. Start again.")

    now = datetime.now(timezone.utc)
    if pending.expires_at < now:
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="That code expired. Request a new one.")

    if pending.attempts >= MAX_ATTEMPTS:
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts. Request a new code.")

    from .auth_utils import verify_password  # same hasher used for otp_hash

    if not verify_password(body.otp, pending.otp_hash):
        pending.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="That code didn't match.")

    # Success — create the real account, discard the pending row.
    user = User(email=pending.email, password_hash=pending.password_hash)
    db.add(user)
    db.delete(pending)
    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    return {"user": {"id": user.id, "email": user.email}, "token": token}