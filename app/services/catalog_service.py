"""
Catalog scanning and maintenance — scans work/ directories and updates catalog.json.
"""

import datetime
import json
import os
import re

from app.config import WORK_DIR, CATALOG_PATH, CAT_MAP
from app.services import index_service


def scan_work_week(week_label: str) -> int:
    """Scan work/{week_label}/ and add new entries to catalog.json."""
    week_dir = os.path.join(WORK_DIR, week_label)
    if not os.path.isdir(week_dir):
        return 0

    if os.path.exists(CATALOG_PATH):
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)
    else:
        existing = []

    existing_keys = {item["work_path"].replace("\\", "/") for item in existing}
    new_items = []

    for root, dirs, files in os.walk(week_dir):
        for fname in files:
            rel_path = os.path.relpath(os.path.join(root, fname), WORK_DIR).replace("\\", "/")
            if rel_path in existing_keys:
                continue

            parts = rel_path.split("/")
            if len(parts) < 2:
                continue
            folder = parts[1]  # e.g. "01_重点报告-331份"
            filename = fname
            cat_match = re.match(r"(\d+)_", folder)
            cat_num = cat_match.group(1) if cat_match else "?"
            cat_name = CAT_MAP.get(cat_num, folder) if cat_match else folder
            pages_match = re.search(r"[-—](\d+)页", filename)
            pages = int(pages_match.group(1)) if pages_match else None
            lang = "英文" if "(英)" in filename else "中文"
            ext = os.path.splitext(filename)[1].lower()
            source = ""
            if cat_num == "02":
                src_match = re.search(r"-\d{6}-(.+?)-\d+页", filename)
                if src_match:
                    source = src_match.group(1)
            if cat_num == "03":
                src_match = re.match(r"([A-Za-z\s&.]+?)[-_]", filename)
                if src_match:
                    source = src_match.group(1).strip()

            file_path = os.path.join(root, fname)
            size = os.path.getsize(file_path)
            mtime = os.path.getmtime(file_path)
            dt = datetime.datetime.fromtimestamp(mtime)
            date_str = f"{dt.year}-{dt.month:02d}-{dt.day:02d}"

            new_items.append({
                "week": week_label,
                "category": cat_name,
                "cat_num": cat_num,
                "filename": filename,
                "work_path": rel_path,
                "size": size,
                "date": date_str,
                "pages": pages,
                "lang": lang,
                "ext": ext,
                "source": source,
            })

    if new_items:
        existing.extend(new_items)
        _write_catalog(existing)
        index_service.invalidate_cache()

    return len(new_items)


def _write_catalog(items: list):
    """Atomically write catalog.json (tmp + replace)."""
    tmp_path = CATALOG_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    os.replace(tmp_path, CATALOG_PATH)


def rebuild_all() -> int:
    """Scan all existing week directories in work/ and rebuild catalog from scratch."""
    if not os.path.isdir(WORK_DIR):
        return 0
    weeks = [d for d in os.listdir(WORK_DIR)
             if os.path.isdir(os.path.join(WORK_DIR, d))
             and re.match(r"\d{4}年\d{1,2}月第\d{1,2}周", d)]
    if not weeks:
        return 0

    all_items = []
    for week_label in weeks:
        week_dir = os.path.join(WORK_DIR, week_label)
        for root, dirs, files in os.walk(week_dir):
            for fname in files:
                rel_path = os.path.relpath(os.path.join(root, fname), WORK_DIR).replace("\\", "/")
                parts = rel_path.split("/")
                if len(parts) < 2:
                    continue
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

                all_items.append({
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
                })

    _write_catalog(all_items)
    index_service.invalidate_cache()
    return len(all_items)


def remove_from_catalog(work_path: str) -> bool:
    """Remove an entry from catalog.json by work_path. Returns True if removed."""
    if not os.path.exists(CATALOG_PATH):
        return False
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        existing = json.load(f)
    wp = work_path.replace("\\", "/")
    new_list = [item for item in existing if item["work_path"].replace("\\", "/") != wp]
    if len(new_list) == len(existing):
        return False
    _write_catalog(new_list)
    index_service.invalidate_cache()
    return True
