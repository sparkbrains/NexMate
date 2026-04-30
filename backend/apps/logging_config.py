import logging
import logging.config
import os


_CONFIGURED = False


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    level = os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                },
                "access": {
                    "()": "uvicorn.logging.AccessFormatter",
                    "format": '%(asctime)s | %(levelname)-8s | %(name)s | %(client_addr)s - "%(request_line)s" %(status_code)s',
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                },
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                },
                "access": {
                    "class": "logging.StreamHandler",
                    "formatter": "access",
                },
            },
            "root": {
                "handlers": ["default"],
                "level": level,
            },
            "loggers": {
                "uvicorn": {"handlers": ["default"], "level": level, "propagate": False},
                "uvicorn.error": {"handlers": ["default"], "level": level, "propagate": False},
                "uvicorn.access": {"handlers": ["access"], "level": level, "propagate": False},
                "fastapi": {"handlers": ["default"], "level": level, "propagate": False},
                "apps": {"handlers": ["default"], "level": level, "propagate": False},
                "nextmate_agent": {"handlers": ["default"], "level": level, "propagate": False},
            },
        }
    )

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)
