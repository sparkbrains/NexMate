import asyncio
import importlib
import logging
import os
import tempfile
from typing import Any, Optional

WhisperModel = Any
_faster_whisper = None
try:
    _faster_whisper = importlib.import_module("faster_whisper")
    WhisperModel = getattr(_faster_whisper, "WhisperModel")
except ModuleNotFoundError:
    WhisperModel = Any

logger = logging.getLogger(__name__)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "tiny.en").strip()
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu").strip()
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8").strip()

_model: Optional[Any] = None


def get_whisper_model() -> Any:
    global _model
    if WhisperModel is None:
        raise RuntimeError(
            "The faster-whisper library is not installed. Install it with `pip install faster-whisper`."
        )
    if _model is None:
        kwargs = {
            "device": WHISPER_DEVICE,
        }
        if WHISPER_DEVICE == "cpu" and WHISPER_COMPUTE_TYPE:
            kwargs["compute_type"] = WHISPER_COMPUTE_TYPE
        _model = WhisperModel(WHISPER_MODEL, **kwargs)
    return _model


async def transcribe_audio(audio_data: bytes, language: str = "en") -> dict[str, Any]:
    """
    Transcribe audio using faster-whisper.

    Args:
        audio_data: Raw audio bytes (webm format)
        language: Language code (e.g., "en" for English)

    Returns:
        Dictionary with 'success', 'transcript', and 'error' keys
    """
    model = get_whisper_model()
    temp_file = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp:
            temp.write(audio_data)
            temp.flush()
            temp_file = temp.name

        def transcribe_file() -> str:
            segments, _ = model.transcribe(
                temp_file,
                language=language,
                task="transcribe",
                vad_filter=True,
            )
            return " ".join(segment.text.strip() for segment in segments).strip()

        transcript = await asyncio.to_thread(transcribe_file)
        if not transcript:
            return {
                "success": False,
                "transcript": "",
                "error": "No transcript was detected from the audio.",
            }

        return {
            "success": True,
            "transcript": transcript,
            "error": None,
        }
    except Exception as e:
        logger.exception("faster-whisper transcription failed")
        return {
            "success": False,
            "transcript": "",
            "error": f"Transcription error: {str(e)}",
        }
    finally:
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass
