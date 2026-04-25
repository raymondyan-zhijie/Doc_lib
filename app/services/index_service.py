"""
Full-text search index using SQLite FTS5.
Also manages favorites and browsing history.
Catalog is cached in memory (mtime-based invalidation).
"""

import json
import os
import sqlite3
import threading
from datetime import datetime

from app.config import CATALOG_PATH, DB_PATH

_lock = threading.Lock()
_catalog = None
_catalog_mtime = 0


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _get_catalog() -> list[dict]:
    """Load catalog.json from disk, with in-memory caching based on file mtime."""
    global _catalog, _catalog_mtime
    try:
        mtime = os.path.getmtime(CATALOG_PATH)
    except OSError:
        return []
    if _catalog is None or mtime != _catalog_mtime:
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            _catalog = json.load(f)
        _catalog_mtime = mtime
    return _catalog


def invalidate_cache():
    """Force next _get_catalog() to reload from disk."""
    global _catalog, _catalog_mtime
    _catalog = None
    _catalog_mtime = 0


def init_db():
    """Create tables if they don't exist."""
    conn = _get_conn()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                work_path TEXT NOT NULL UNIQUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                work_path TEXT NOT NULL,
                opened_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_history_opened ON history(opened_at DESC);

            CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(
                filename,
                category,
                source,
                week,
                content='',
                tokenize='unicode61'
            );
        """)
    finally:
        conn.close()


def build_full_index():
    """Build FTS5 index from catalog.json. Replaces existing index."""
    conn = _get_conn()
    try:
        try:
            conn.execute("DELETE FROM fts_index")
        except Exception:
            pass
        conn.commit()

        catalog = _get_catalog()
        if not catalog:
            return 0

        conn.execute("BEGIN")
        try:
            for i, item in enumerate(catalog):
                conn.execute(
                    "INSERT INTO fts_index(rowid, filename, category, source, week) VALUES (?, ?, ?, ?, ?)",
                    (i + 1, item["filename"], item.get("category", ""), item.get("source", ""), item["week"]),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise

        invalidate_cache()
        return len(catalog)
    finally:
        conn.close()


def incremental_index(new_items: list[dict]):
    """Add new items to the FTS5 index without rebuilding."""
    conn = _get_conn()
    try:
        max_row = conn.execute("SELECT MAX(rowid) FROM fts_index").fetchone()[0] or 0
        conn.execute("BEGIN")
        try:
            for item in new_items:
                max_row += 1
                conn.execute(
                    "INSERT INTO fts_index(rowid, filename, category, source, week) VALUES (?, ?, ?, ?, ?)",
                    (max_row, item["filename"], item.get("category", ""), item.get("source", ""), item["week"]),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    finally:
        conn.close()


def search(query: str, limit: int = 50) -> list[dict]:
    """Full-text search. Returns list of matching catalog items."""
    q = query.strip()
    if not q:
        return []

    conn = _get_conn()
    try:
        try:
            rows = conn.execute(
                "SELECT rowid FROM fts_index WHERE fts_index MATCH ? ORDER BY rank LIMIT ?",
                (q, limit),
            ).fetchall()
        except sqlite3.OperationalError:
            simple_q = " OR ".join(f'"{w}"' for w in q.split() if len(w) > 1)
            if not simple_q:
                return []
            try:
                rows = conn.execute(
                    "SELECT rowid FROM fts_index WHERE fts_index MATCH ? ORDER BY rank LIMIT ?",
                    (simple_q, limit),
                ).fetchall()
            except sqlite3.OperationalError:
                return []
    finally:
        conn.close()

    catalog = _get_catalog()
    if not catalog:
        return []

    results = []
    for row in rows:
        rid = row[0]
        if 1 <= rid <= len(catalog):
            results.append(catalog[rid - 1])

    return results


# ============ Favorites ============

def add_favorite(filename: str, work_path: str):
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO favorites (filename, work_path) VALUES (?, ?)",
            (filename, work_path),
        )
        conn.commit()
    finally:
        conn.close()


def remove_favorite(work_path: str):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM favorites WHERE work_path = ?", (work_path,))
        conn.commit()
    finally:
        conn.close()


def get_favorites() -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT filename, work_path, created_at FROM favorites ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def is_favorite(work_path: str) -> bool:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT 1 FROM favorites WHERE work_path = ? LIMIT 1", (work_path,)).fetchone()
        return row is not None
    finally:
        conn.close()


# ============ History ============

def add_history(filename: str, work_path: str):
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO history (filename, work_path, opened_at) VALUES (?, ?, ?)",
            (filename, work_path, datetime.now().isoformat()),
        )
        conn.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY opened_at DESC LIMIT 500)")
        conn.commit()
    finally:
        conn.close()


def get_history(limit: int = 100) -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT filename, work_path, opened_at FROM history ORDER BY opened_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ============ Statistics ============

def get_source_stats() -> dict:
    """Get report count by source, grouped by category."""
    catalog = _get_catalog()
    if not catalog:
        return {}
    stats = {}
    for item in catalog:
        if item.get("source"):
            key = (item["cat_num"], item["source"])
            stats[key] = stats.get(key, 0) + 1
    return {"sources": [
        {"cat_num": k[0], "source": k[1], "count": v}
        for k, v in sorted(stats.items(), key=lambda x: -x[1])
    ]}


def get_weekly_stats() -> dict:
    """Get report count by week and category."""
    catalog = _get_catalog()
    if not catalog:
        return {}
    stats = {}
    for item in catalog:
        key = (item["week"], item["cat_num"])
        stats[key] = stats.get(key, 0) + 1
    return {"weekly": [
        {"week": k[0], "cat_num": k[1], "count": v}
        for k, v in sorted(stats.items())
    ]}
