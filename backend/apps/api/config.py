import os


STREAM_CHUNK_SIZE = int(os.getenv("STREAM_CHUNK_SIZE", "1"))
STREAM_DELAY_SECONDS = float(os.getenv("STREAM_DELAY_SECONDS", "0.03"))
