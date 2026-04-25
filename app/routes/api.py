"""
API routes for the Doc_Lib Catalog Browser.
"""

import datetime
import json
import os
import platform
import re
import shutil
import threading
import time

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, Response

from app.config import BASE_DIR, ARCHIVES_DIR, CATALOG_PATH, HTML_PATH, MAX_UPLOAD_SIZE, open_file_external
from app.models import (
    BatchExtractRequest,
    FavoriteItem,
)
from app.services import index_service, zip_service
from app.services import catalog_service

router = APIRouter(prefix="/api")


# ============ Static ============

@router.get("/../", include_in_schema=False)
@router.get("/", include_in_schema=False)
async def serve_html():
    if not os.path.isfile(HTML_PATH):
        raise HTTPException(404, "browser.html not found")
    return FileResponse(HTML_PATH, media_type="text/html; charset=utf-8")


# ============ Catalog ============

@router.get("/catalog")
async def get_catalog():
    if not os.path.isfile(CATALOG_PATH):
        raise HTTPException(404, "catalog.json not found")
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return Response(content=json.dumps(data, ensure_ascii=False), media_type="application/json",
                    headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


# ============ Open & Extract ============

@router.get("/open")
async def open_file(work_path: str = Query(...)):
    try:
        result = zip_service.open_file(work_path)
        index_service.add_history(
            filename=os.path.basename(work_path),
            work_path=work_path,
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@router.get("/extract")
async def extract_file(work_path: str = Query(...), target_dir: str = Query("")):
    try:
        td = target_dir.strip() if target_dir else ""
        return zip_service.extract_file(work_path, td if td else None)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.get("/config")
async def get_config():
    """Return server-side config (paths, platform info)."""
    return {
        "base_dir": BASE_DIR,
        "default_extract_dir": os.path.join(BASE_DIR, "extracted"),
        "platform": platform.system(),
    }


@router.get("/open-dir")
async def open_dir(path: str = Query(...)):
    """Open a directory in the system file explorer. Creates it if needed."""
    try:
        safe_path = zip_service._validate_path(os.path.abspath(path), BASE_DIR)
    except PermissionError:
        raise HTTPException(403, "Access denied: path outside allowed directory")
    os.makedirs(safe_path, exist_ok=True)
    try:
        open_file_external(safe_path)
        return {"status": "opened", "path": safe_path}
    except Exception as e:
        raise HTTPException(500, "Failed to open directory")


@router.get("/file")
async def serve_file(work_path: str = Query(...)):
    try:
        path = zip_service.serve_file(work_path)
        return FileResponse(path)
    except PermissionError:
        raise HTTPException(403, "Access denied")
    except FileNotFoundError:
        raise HTTPException(404, "File not found")


# ============ Batch ============

@router.post("/batch-extract")
async def batch_extract(req: BatchExtractRequest):
    if not req.items:
        raise HTTPException(400, "No items specified")
    if not req.target_dir:
        raise HTTPException(400, "No target directory specified")
    try:
        os.makedirs(req.target_dir, exist_ok=True)
    except OSError:
        raise HTTPException(400, f"Cannot create directory: {req.target_dir}")

    task_id = zip_service.start_batch_extract(
        [item.model_dump() for item in req.items],
        req.target_dir,
    )
    return {"task_id": task_id, "total": len(req.items)}


@router.get("/batch-progress")
async def batch_progress(task_id: str = Query(...)):
    progress = zip_service.get_batch_progress(task_id)
    if not progress:
        raise HTTPException(404, "Task not found")
    return progress


# ============ Full-Text Search ============

@router.get("/search")
async def fulltext_search(q: str = Query(...), limit: int = Query(50)):
    results = index_service.search(q, limit)
    return {"query": q, "count": len(results), "results": results}


@router.post("/rebuild-index")
async def rebuild_index():
    count = index_service.build_full_index()
    return {"status": "ok", "indexed": count}


# ============ Favorites ============

@router.get("/favorites")
async def get_favorites():
    return index_service.get_favorites()


@router.post("/favorites")
async def add_favorite(item: FavoriteItem):
    index_service.add_favorite(item.filename, item.work_path)
    return {"status": "ok"}


@router.delete("/favorites")
async def remove_favorite(work_path: str = Query(...)):
    index_service.remove_favorite(work_path)
    return {"status": "ok"}


@router.get("/favorites/check")
async def check_favorite(work_path: str = Query(...)):
    return {"is_favorite": index_service.is_favorite(work_path)}


# ============ History ============

@router.get("/history")
async def get_history(limit: int = Query(100)):
    return index_service.get_history(limit)


# ============ Statistics ============

@router.get("/stats/sources")
async def source_stats():
    return index_service.get_source_stats()


@router.get("/stats/weekly")
async def weekly_stats():
    return index_service.get_weekly_stats()


# ============ Upload New Archive ============

@router.post("/upload")
async def upload_zip(
    file: UploadFile = File(...),
    week_label: str = Query("", description="e.g. 2026年4月第4周"),
):
    """Upload a new weekly ZIP archive: save to archives/, extract to work/, update catalog."""

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Only .zip files are accepted")

    # Determine week label
    if not week_label:
        m = re.match(r"(\d{4}年\d{1,2}月第\d{1,2}周)", file.filename)
        if m:
            week_label = m.group(1)
    if not week_label:
        raise HTTPException(400, "Could not determine week label. Provide one (e.g. 2026年4月第4周).")

    zip_filename = f"{week_label}.zip"
    zip_path = os.path.join(ARCHIVES_DIR, zip_filename)

    if os.path.exists(zip_path):
        raise HTTPException(409, f"Archive already exists: {zip_filename}")

    os.makedirs(ARCHIVES_DIR, exist_ok=True)

    # Save ZIP to archives/
    try:
        total_size = 0
        with open(zip_path, "wb") as f:
            while True:
                chunk = await file.read(8 * 1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    f.close()
                    os.remove(zip_path)
                    raise HTTPException(413, f"File too large. Max size: {MAX_UPLOAD_SIZE // (1024**3)} GB")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception:
        if os.path.exists(zip_path):
            os.remove(zip_path)
        raise HTTPException(500, "Failed to save uploaded file")

    # Extract to work/
    try:
        file_count = zip_service.extract_archive_to_work(zip_filename, week_label)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")

    # Scan and index, then rebuild FTS so rowids stay aligned with catalog
    new_count = catalog_service.scan_work_week(week_label)
    index_service.build_full_index()
    return {
        "status": "ok",
        "week_label": week_label,
        "zip_filename": zip_filename,
        "files_extracted": file_count,
        "new_entries": new_count,
    }


# ============ Shutdown ============

@router.post("/shutdown")
async def shutdown_server():
    """Gracefully shut down the server."""

    def _shutdown():
        time.sleep(0.3)
        from app import main
        server = getattr(main, '_uvicorn_server', None)
        if server:
            server.should_exit = True
        else:
            os._exit(0)

    threading.Thread(target=_shutdown, daemon=True).start()
    return {"status": "shutting_down"}

