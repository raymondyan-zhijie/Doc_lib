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

from app.config import BASE_DIR, WORK_DIR, TMP_DIR, ARCHIVES_DIR, get_7z, open_file_external

_batch_tasks: dict = {}
_batch_lock = threading.Lock()
_cancel_tasks: set = set()
_MAX_BATCH_TASKS = 100
_CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB — visible progress for large files


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
    # normcase handles Windows case-insensitive path comparison
    root_cmp = os.path.normcase(real_root)
    path_cmp = os.path.normcase(real_path)
    if not path_cmp.startswith(root_cmp + os.sep) and path_cmp != root_cmp:
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
    else:
        target_dir = _validate_path(os.path.abspath(target_dir), BASE_DIR)
    os.makedirs(target_dir, exist_ok=True)
    src = resolve_work_path(work_path)
    if not os.path.isfile(src):
        raise FileNotFoundError(f"File not found: {work_path}")
    base = os.path.basename(src)
    name, ext = os.path.splitext(base)
    dst = os.path.join(target_dir, base)
    counter = 1
    while os.path.exists(dst):
        dst = os.path.join(target_dir, f"{name}_{counter}{ext}")
        counter += 1
    shutil.copy2(src, dst)
    return {
        "status": "ok",
        "filename": os.path.basename(dst),
        "path": dst,
    }


def move_to_recycle_bin(work_path: str) -> str:
    """Move a file from work/ to work/.recycle_bin/, preserving relative path structure."""
    src = resolve_work_path(work_path)
    if not os.path.isfile(src):
        raise FileNotFoundError(f"File not found: {work_path}")
    recycle_root = os.path.join(WORK_DIR, ".recycle_bin")
    rel = os.path.relpath(src, WORK_DIR)
    dst = os.path.join(recycle_root, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        name, ext = os.path.splitext(dst)
        counter = 1
        while os.path.exists(f"{name}_{counter}{ext}"):
            counter += 1
        dst = f"{name}_{counter}{ext}"
    shutil.move(src, dst)
    return dst


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
        task = _batch_tasks.get(task_id)
        if task is None:
            return None
        # Return a shallow copy so callers can't mutate internal state
        return dict(task)


def _run_batch(items: list[dict], target_dir: str, task_id: str):
    done = 0
    errors = []
    with _batch_lock:
        _batch_tasks[task_id]["total_bytes"] = 0
        _batch_tasks[task_id]["copied_bytes"] = 0
        # Compute total size for large-file progress
        total = 0
        for item in items:
            try:
                wp = item.get("work_path", "")
                src = resolve_work_path(wp)
                if os.path.isfile(src):
                    total += os.path.getsize(src)
            except Exception:
                pass
        _batch_tasks[task_id]["total_bytes"] = total

    for item in items:
        if task_id in _cancel_tasks:
            with _batch_lock:
                _batch_tasks[task_id]["status"] = "cancelled"
                _batch_tasks[task_id]["errors"] = errors
            _cancel_tasks.discard(task_id)
            return
        try:
            wp = item.get("work_path", "")
            src = resolve_work_path(wp)
            if os.path.isfile(src):
                base = os.path.basename(src)
                name, ext = os.path.splitext(base)
                dst = os.path.join(target_dir, base)
                counter = 1
                while os.path.exists(dst):
                    dst = os.path.join(target_dir, f"{name}_{counter}{ext}")
                    counter += 1
                _copyfile_chunked(src, dst, task_id)
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
        _cancel_tasks.discard(task_id)
        # Cleanup: remove oldest completed tasks beyond limit
        if len(_batch_tasks) > _MAX_BATCH_TASKS:
            done_keys = [k for k, v in _batch_tasks.items() if v["status"] in ("done", "cancelled")]
            excess = len(_batch_tasks) - _MAX_BATCH_TASKS // 2
            if excess > 0:
                for k in done_keys[:excess]:
                    del _batch_tasks[k]


def _copyfile_chunked(src: str, dst: str, task_id: str):
    """Copy a file in chunks, updating batch progress so large files don't appear frozen."""
    with open(src, "rb") as fsrc, open(dst, "xb") as fdst:
        while True:
            chunk = fsrc.read(_CHUNK_SIZE)
            if not chunk:
                break
            fdst.write(chunk)
            with _batch_lock:
                task = _batch_tasks.get(task_id)
                if task:
                    task["copied_bytes"] = task.get("copied_bytes", 0) + len(chunk)
    shutil.copymode(src, dst)


def cancel_batch(task_id: str) -> bool:
    """Signal a running batch task to cancel at the next file boundary."""
    with _batch_lock:
        task = _batch_tasks.get(task_id)
        if task and task["status"] == "running":
            _cancel_tasks.add(task_id)
            return True
    return False


# ============ Upload / Extract new archive ============

def extract_archive_to_work(zip_filename: str, week_label: str) -> int:
    """Extract a ZIP from archives/ into work/{week_label}/. Returns file count."""
    zip_path = os.path.join(ARCHIVES_DIR, zip_filename)
    target = os.path.join(WORK_DIR, week_label)

    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f"Archive not found: {zip_filename}")

    os.makedirs(target, exist_ok=True)
    result = subprocess.run(
        [get_7z(), "x", zip_path, f"-o{target}", "-aoa", "-y"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"7z extraction failed: {result.stderr or result.stdout}")

    count = 0
    for _, _, files in os.walk(target):
        count += len(files)
    return count
