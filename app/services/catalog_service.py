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
        tmp_path = CATALOG_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=1)
        os.replace(tmp_path, CATALOG_PATH)
        index_service.invalidate_cache()

    return len(new_items)
