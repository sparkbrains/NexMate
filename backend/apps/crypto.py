"""Application-layer encryption for sensitive columns.

Values are encrypted with Fernet (AES-128-CBC + HMAC, authenticated) before
they're written to Postgres, and decrypted after they're read back. This
protects the data at rest against anyone with read access to the database
or a backup (a stolen dump, a compromised read-only credential) that
disk-level encryption alone doesn't cover.

decrypt_text() treats anything that isn't a valid Fernet token as legacy
plaintext (written before encryption was enabled) and returns it unchanged,
so existing rows keep working without a hard cutover migration.
"""
import hashlib
import json
import os
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = os.getenv("DB_ENCRYPTION_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "DB_ENCRYPTION_KEY is required. Generate one with:\n"
            '  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode("ascii"))


def encrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return value


def encrypt_json(value: Any) -> str:
    """Serialize + encrypt a JSON-able value (e.g. a list of strings) to a
    string suitable for storing in a jsonb column (as a JSON string scalar,
    via psycopg's Jsonb() wrapper) or a text column."""
    return encrypt_text(json.dumps(value))


def decrypt_json(value: Any, default: Any = None) -> Any:
    """Inverse of encrypt_json. Also tolerates legacy rows where the column
    still holds a plain JSON array/object rather than an encrypted string."""
    if value is None:
        return default
    if not isinstance(value, str):
        # Legacy row: jsonb column still holds the plaintext array/object.
        return value
    decrypted = decrypt_text(value)
    try:
        return json.loads(decrypted)
    except (TypeError, ValueError):
        return default


def content_hash(value: str) -> str:
    """Stable hash of plaintext content, used where a unique/dedupe index
    needs to compare content but the column itself is now encrypted (Fernet
    output differs on every call, even for identical plaintext)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
