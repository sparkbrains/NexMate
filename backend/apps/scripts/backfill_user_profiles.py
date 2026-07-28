import asyncio
import logging

from apps.db import get_connection
from apps.api.services.user_profile_service import get_or_refresh_user_profile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _get_all_user_ids() -> list[int]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT user_id FROM prompt_pack_answers")
            return [row["user_id"] for row in cur.fetchall()]


async def main() -> None:
    user_ids = _get_all_user_ids()
    logger.info("Backfilling profiles for %s users", len(user_ids))
    for uid in user_ids:
        try:
            profile = await get_or_refresh_user_profile(uid)
            logger.info(
                "user_id=%s -> %s",
                uid,
                "generated" if profile else "skipped (no answers)",
            )
        except Exception:
            logger.exception("Failed for user_id=%s", uid)


if __name__ == "__main__":
    asyncio.run(main())