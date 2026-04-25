"""
File access service — all file serving and extraction goes through here.
Files are served from the work/ directory (pre-extracted archives).
Security: all paths are validated against WORK_DIR to prevent traversal.
7-Zip is only used for uploading/extracting new archives into work/.
"""

import os
import shutil
import subprocess
import threading

from app.config import BASE_DIR, WORK_DIR, TMP_DIR, ARCHIVES_DIR, SEVEN_ZIP, open_file_external

_batch_tasks: dict = {}
_batch_lock = threading.Lock()


def ensure_tmp():
    os.makedirs(TMP_DIR, exist_ok=True)


def clean_tmp():
    if os.path.isdir(TMP_DIR):
        shutil.rmtree(TMP_DIR, ignore_errors=True)
    os.makedirs(TMP_DIR, exist_ok=True)


def _validate_path(filepath: str, root: str) -> str:
    """Validate that a path is within a root directory (prevent traversal)."""
    real_root = os.path.realpath(root)
    real_path = os.path.realpath(filepath)
    if not real_path.startswith(real_root + os.sep) and real_path != real_root:
        raise PermissionError(f"Access denied: path outside allowed directory")
    return real_path


def resolve_work_path(work_path: str) -> str:
    """Resolve a relative work_path to an absolute path, validating it's in WORK_DIR."""
    # Normalize separators and remove leading/trailing slashes
    work_path = work_path.replace("\\", "/").strip("/")
    abs_path = os.path.normpath(os.path.join(WORK_DIR, work_path))
    return _validate_path(abs_path, WORK_DIR)


def open_file(work_path: str):
    """Open a file from work/ with the system default app."""
    path = resolve_work_path(work_path)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"File not found: {work_path}")
    open_file_external(path)
    return {"status": "opened", "path": path}


def extract_file(work_path: str, target_dir: str = None):
    """Copy a file from work/ to a target directory. If no target, use .tmp/."""
    if target_dir is None:
        target_dir = TMP_DIR
    os.makedirs(target_dir, exist_ok=True)
    src = resolve_work_path(work_path)
    if not os.path.isfile(src):
        raise FileNotFoundError(f"File not found: {work_path}")
    dst = os.path.join(target_dir, os.path.basename(src))
    shutil.copy2(src, dst)
    return {
        "status": "ok",
        "filename": os.path.basename(dst),
        "path": dst,
    }


def serve_file(work_path: str):
    """Validate and return absolute path for serving via FileResponse."""
    path = resolve_work_path(work_path)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"File not found: {work_path}")
    return path


# ============ Batch ============

def start_batch_extract(items: list[dict], target_dir: str) -> str:
    """Start a batch copy from work/ to a timestamped subdirectory under target_dir."""
    import time as _time
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    batch_dir = os.path.join(target_dir, ts)
    os.makedirs(batch_dir, exist_ok=True)
    task_id = f"batch_{int(_time.time() * 1000)}"
    with _batch_lock:
        _batch_tasks[task_id] = {
            "task_id": task_id,
            "status": "running",
            "total": len(items),
            "done": 0,
            "errors": [],
            "batch_dir": batch_dir,
        }
    t = threading.Thread(target=_run_batch, args=(items, batch_dir, task_id), daemon=True)
    t.start()
    return task_id


def get_batch_progress(task_id: str) -> dict | None:
    with _batch_lock:
        return _batch_tasks.get(task_id)


def _run_batch(items: list[dict], target_dir: str, task_id: str):
    done = 0
    errors = []
    for item in items:
        try:
            wp = item.get("work_path", "")
            src = resolve_work_path(wp)
            if os.path.isfile(src):
                dst = os.path.join(target_dir, os.path.basename(src))
                shutil.copy2(src, dst)
            else:
                errors.append(f"{wp}: File not found")
        except Exception as e:
            errors.append(f"{wp}: {e}")
        done += 1
        with _batch_lock:
            _batch_tasks[task_id]["done"] = done
    with _batch_lock:
        _batch_tasks[task_id]["status"] = "done"
        _batch_tasks[task_id]["errors"] = errors


# ============ Upload / Extract new archive ============

def extract_archive_to_work(zip_filename: str, week_label: str) -> int:
    """Extract a ZIP from archives/ into work/{week_label}/. Returns file count."""
    zip_path = os.path.join(ARCHIVES_DIR, zip_filename)
    target = os.path.join(WORK_DIR, week_label)

    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f"Archive not found: {zip_filename}")

    os.makedirs(target, exist_ok=True)
    result = subprocess.run(
        [SEVEN_ZIP, "x", zip_path, f"-o{target}", "-aoa", "-y"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"7z extraction failed: {result.stderr or result.stdout}")

    count = 0
    for _, _, files in os.walk(target):
        count += len(files)
    return count
