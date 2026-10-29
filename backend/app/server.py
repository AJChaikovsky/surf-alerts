"""Production entry point: the built React app and the API on one origin.

In development, Vite serves the frontend and proxies /api/* to FastAPI,
stripping the /api prefix. This does the same in production, so the
session cookie (SameSite=Lax) is always sent to the API.

Run with: uvicorn app.server:application
"""
import os
from pathlib import Path

from starlette.staticfiles import StaticFiles

from app.main import app as api


# Where the Docker build puts `npm run build` output.
DEFAULT_STATIC_DIR = Path(__file__).resolve().parents[1] / "static"


def create_application(static_dir: Path | str):
    # check_dir=False so importing this module doesn't require a build.
    frontend = StaticFiles(directory=static_dir, html=True, check_dir=False)

    async def application(scope, receive, send):
        path = scope.get("path", "")

        if scope["type"] == "lifespan":
            await api(scope, receive, send)

        elif path == "/api" or path.startswith("/api/"):
            api_path = path[len("/api"):] or "/"

            await api(
                {**scope, "path": api_path, "raw_path": api_path.encode()},
                receive,
                send
            )

        else:
            await frontend(scope, receive, send)

    return application


application = create_application(
    os.getenv("STATIC_DIR", DEFAULT_STATIC_DIR)
)
