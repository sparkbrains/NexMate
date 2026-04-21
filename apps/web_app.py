from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from apps.api.config import WEB_DIR
from apps.api.routers.http import router as http_router
from apps.api.routers.ws import router as ws_router


app = FastAPI(title="NextMate Web")
app.mount("/assets", StaticFiles(directory=str(WEB_DIR)), name="assets")
app.include_router(http_router)
app.include_router(ws_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("apps.web_app:app", host="127.0.0.1", port=8000, reload=True)

