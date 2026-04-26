"""
Catalog scanning and maintenance — scans work/ directories and updates SQLite catalog.
"""

import datetime
import os
import re
import sqlite3

from app.config import WORK_DIR, DB_PATH, CAT_MAP
from app.services import index_service


def _get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _extract_file_info(root, fname, week_label, work_dir):
    """Extract catalog fields from a file on disk. Returns dict or None."""
    rel_path = os.path.relpath(os.path.join(root, fname), work_dir).replace("\\", "/")
    parts = rel_path.split("/")
    if len(parts) < 2:
        return None
    folder = parts[1]
    cat_match = re.match(r"(\d+)_", folder)
    cat_num = cat_match.group(1) if cat_match else "?"
    cat_name = CAT_MAP.get(cat_num, folder) if cat_match else folder
    pages_match = re.search(r"[-—](\d+)页", fname)
    pages = int(pages_match.group(1)) if pages_match else None
    lang = "英文" if "(英)" in fname else "中文"
    ext = os.path.splitext(fname)[1].lower()
    source = ""
    if cat_num == "02":
        src_match = re.search(r"-\d{6}-(.+?)-\d+页", fname)
        if src_match:
            source = src_match.group(1)
    if cat_num == "03":
        src_match = re.match(r"([A-Za-z\s&.]+?)[-_]", fname)
        if src_match:
            source = src_match.group(1).strip()
    file_path = os.path.join(root, fname)
    size = os.path.getsize(file_path)
    mtime = os.path.getmtime(file_path)
    dt = datetime.datetime.fromtimestamp(mtime)
    date_str = f"{dt.year}-{dt.month:02d}-{dt.day:02d}"

    return {
        "week": week_label,
        "category": cat_name,
        "cat_num": cat_num,
        "filename": fname,
        "work_path": rel_path,
        "size": size,
        "date": date_str,
        "pages": pages,
        "lang": lang,
        "ext": ext,
        "source": source,
    }


SQL_INSERT = (
    "INSERT OR IGNORE INTO catalog(work_path, filename, category, cat_num, week, source, lang, pages, size, date, ext) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

SQL_INSERT_PARAMS = lambda item: (
    item["work_path"], item["filename"], item["category"], item["cat_num"],
    item["week"], item["source"], item["lang"], item["pages"],
    item["size"], item["date"], item["ext"],
)


def scan_work_week(week_label: str) -> int:
    """Scan work/{week_label}/ and add new entries to SQLite catalog + FTS index."""
    week_dir = os.path.join(WORK_DIR, week_label)
    if not os.path.isdir(week_dir):
        return 0

    conn = _get_conn()
    new_items = []
    try:
        existing = set(r[0] for r in conn.execute("SELECT work_path FROM catalog").fetchall())

        for root, dirs, files in os.walk(week_dir):
            for fname in files:
                item = _extract_file_info(root, fname, week_label, WORK_DIR)
                if item is None:
                    continue
                if item["work_path"] in existing:
                    continue
                conn.execute(SQL_INSERT, SQL_INSERT_PARAMS(item))
                new_items.append(item)

        if new_items:
            conn.commit()
    finally:
        conn.close()

    if new_items:
        index_service.incremental_index(new_items)

    return len(new_items)


def rebuild_all() -> int:
    """Scan all work/ week directories and rebuild SQLite catalog + FTS from scratch."""
    if not os.path.isdir(WORK_DIR):
        return 0

    weeks = [d for d in os.listdir(WORK_DIR)
             if os.path.isdir(os.path.join(WORK_DIR, d))
             and re.match(r"\d{4}年\d{1,2}月第\d{1,2}周", d)]
    if not weeks:
        return 0

    conn = _get_conn()
    try:
        conn.execute("DELETE FROM catalog")
        conn.commit()

        for week_label in weeks:
            week_dir = os.path.join(WORK_DIR, week_label)
            for root, dirs, files in os.walk(week_dir):
                for fname in files:
                    item = _extract_file_info(root, fname, week_label, WORK_DIR)
                    if item is None:
                        continue
                    conn.execute(SQL_INSERT, SQL_INSERT_PARAMS(item))
        conn.commit()
    finally:
        conn.close()

    return index_service.build_full_index()


def remove_from_catalog(work_path: str) -> bool:
    """Remove an entry from SQLite catalog by work_path. Returns True if removed."""
    wp = work_path.replace("\\", "/")
    conn = _get_conn()
    try:
        cur = conn.execute("DELETE FROM catalog WHERE work_path = ?", (wp,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
