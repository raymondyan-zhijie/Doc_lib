import os
import platform
import shutil
import subprocess
from pathlib import Path

BASE_DIR = str(Path(__file__).resolve().parent.parent)
ARCHIVES_DIR = os.path.join(BASE_DIR, "archives")
WORK_DIR = os.path.join(BASE_DIR, "work")
TMP_DIR = os.path.join(BASE_DIR, ".tmp")
CATALOG_PATH = os.path.join(BASE_DIR, "catalog.json")
HTML_PATH = os.path.join(BASE_DIR, "browser.html")
DB_PATH = os.path.join(BASE_DIR, "doclib.db")
DEFAULT_PORT = 8765
MAX_UPLOAD_SIZE = 8 * 1024 * 1024 * 1024  # 8 GB

CAT_MAP = {
    "01": "重点报告",
    "02": "国内券商报告",
    "03": "投行报告",
    "04": "小报告",
    "05": "杂货（培训课件、经管、统计数据）",
}

CAT_NAMES_SHORT = {
    "01": "重点报告",
    "02": "国内券商",
    "03": "投行报告",
    "04": "小报告",
    "05": "杂货",
}


def open_file_external(filepath: str):
    """Open a file with the system default application."""
    system = platform.system()
    if system == "Windows":
        os.startfile(filepath)
    elif system == "Darwin":
        subprocess.run(["open", filepath], check=False)
    else:
        subprocess.run(["xdg-open", filepath], check=False)


def find_7z():
    """Find 7-Zip executable. Checks env var, then PATH, then common install locations."""
    env_path = os.environ.get("SEVEN_ZIP_PATH") or os.environ.get("7ZIP_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    found = shutil.which("7z") or shutil.which("7z.exe") or shutil.which("7zz") or shutil.which("7zz.exe")
    if found:
        return found
    if platform.system() == "Windows":
        candidates = [
            r"C:\Program Files\7-Zip\7z.exe",
            r"C:\Program Files (x86)\7-Zip\7z.exe",
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c
    raise FileNotFoundError("7-Zip not found. Install 7-Zip or set SEVEN_ZIP_PATH env var.")


_SEVEN_ZIP = None

def get_7z():
    """Lazy-load 7-Zip path. Only raises if actually needed (extract/upload)."""
    global _SEVEN_ZIP
    if _SEVEN_ZIP is None:
        _SEVEN_ZIP = find_7z()
    return _SEVEN_ZIP
