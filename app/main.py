"""
Doc_Lib Catalog Browser — FastAPI Application
"""

import os
import traceback
import webbrowser

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import DEFAULT_PORT, DB_PATH, HTML_PATH
from app.routes.api import router
from app.services import index_service, zip_service

app = FastAPI(
    title="Doc_Lib 文档目录浏览器",
    description="浏览、筛选、搜索、打开和批量提取研究报告",
    version="3.0.0",
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"error": str(exc)})


app.include_router(router)


@app.get("/", include_in_schema=False)
async def root():
    if os.path.isfile(HTML_PATH):
        from fastapi.responses import FileResponse, Response
        resp = FileResponse(HTML_PATH, media_type="text/html; charset=utf-8")
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp
    return JSONResponse({"error": "browser.html not found"}, status_code=404)


@app.on_event("startup")
async def startup():
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
            print(f"FTS index built: {indexed} entries")
        else:
            print(f"FTS index ready: {count} entries")
    except Exception as e:
        print(f"FTS index check failed: {e}, will build on first search")

    print(f"Doc_Lib v3.0 ready — http://localhost:{DEFAULT_PORT}")


def run_server(port: int = DEFAULT_PORT):
    """Run the server — called from server.py entry point."""
    import uvicorn
    url = f"http://localhost:{port}"
    print(f"Doc_Lib Catalog Browser v3.0")
    print(f"  Work dir: {os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work')}")
    print(f"  Archives: {os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'archives')}")
    print(f"  API docs: {url}/docs")
    print(f"  Serving at: {url}")
    print(f"  Press Ctrl+C to stop")
    webbrowser.open(url)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
