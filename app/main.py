"""
Doc_Lib Catalog Browser — FastAPI Application
"""

import logging
import os
import traceback
import webbrowser
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from app.config import DEFAULT_PORT, DB_PATH, HTML_PATH
from app.routes.api import router
from app.services import index_service, zip_service

logger = logging.getLogger("doclib")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    zip_service.clean_tmp()
    zip_service.ensure_tmp()
    index_service.init_db()

    # Build FTS index if empty
    try:
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA journal_mode=WAL")
        try:
            count = conn.execute("SELECT COUNT(*) FROM fts_index").fetchone()[0]
        except sqlite3.OperationalError:
            count = 0
        conn.close()
        if count == 0:
            indexed = index_service.build_full_index()
            logger.info("FTS index built: %d entries", indexed)
        else:
            logger.info("FTS index ready: %d entries", count)
    except Exception as e:
        logger.warning("FTS index check failed: %s, will build on first search", e)

    logger.info("Doc_Lib v3.0 ready — http://localhost:%d", DEFAULT_PORT)
    yield


app = FastAPI(
    title="Doc_Lib 文档目录浏览器",
    description="浏览、筛选、搜索、打开和批量提取研究报告",
    version="3.0.0",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


app.include_router(router)


@app.get("/", include_in_schema=False)
async def root():
    if os.path.isfile(HTML_PATH):
        resp = FileResponse(HTML_PATH, media_type="text/html; charset=utf-8")
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp
    return JSONResponse({"error": "browser.html not found"}, status_code=404)


def run_server(port: int = DEFAULT_PORT):
    """Run the server — called from server.py entry point."""
    import uvicorn
    from app import config
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    url = f"http://localhost:{port}"
    logger.info("Doc_Lib Catalog Browser v3.0")
    logger.info("  Work dir: %s", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work'))
    logger.info("  Archives: %s", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'archives'))
    logger.info("  API docs: %s/docs", url)
    logger.info("  Serving at: %s", url)
    logger.info("  Press Ctrl+C to stop")
    webbrowser.open(url)
    uvicorn_config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(uvicorn_config)
    config._uvicorn_server = server
    server.run()
