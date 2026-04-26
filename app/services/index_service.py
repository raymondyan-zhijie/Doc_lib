"""
Full-text search index using SQLite FTS5.
Also manages favorites, browsing history, and catalog.
Catalog is stored in SQLite (no more catalog.json in-memory cache).
"""

import json
import os
import sqlite3
import threading
from datetime import datetime

from app.config import CATALOG_PATH, DB_PATH

_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ============ Schema & Migration ============

def init_db():
    """Create tables and migrate from catalog.json if needed."""
    conn = _get_conn()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog (
                work_path TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                category TEXT NOT NULL,
                cat_num TEXT NOT NULL,
                week TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT '',
                lang TEXT NOT NULL DEFAULT '中文',
                pages INTEGER,
                size INTEGER NOT NULL DEFAULT 0,
                date TEXT NOT NULL,
                ext TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                work_path TEXT NOT NULL UNIQUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                work_path TEXT NOT NULL,
                opened_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_history_opened ON history(opened_at DESC)")

        # Check if FTS needs migration (old standalone → new content=catalog)
        cur = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='fts_index'")
        row = cur.fetchone()
        if row and 'content=' not in (row[0] or ''):
            conn.execute("DROP TABLE IF EXISTS fts_index")

        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(
                work_path,
                filename,
                category,
                source,
                week,
                content=catalog,
                content_rowid=rowid,
                tokenize='unicode61'
            )
        """)

        # Migrate from catalog.json if catalog table is empty
        count = conn.execute("SELECT COUNT(*) FROM catalog").fetchone()[0]
        if count == 0 and os.path.isfile(CATALOG_PATH):
            with open(CATALOG_PATH, "r", encoding="utf-8") as f:
                entries = json.load(f)
            for item in entries:
                conn.execute(
                    "INSERT OR IGNORE INTO catalog(work_path, filename, category, cat_num, week, source, lang, pages, size, date, ext) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (item["work_path"], item["filename"], item.get("category", ""), item.get("cat_num", ""),
                     item["week"], item.get("source", ""), item.get("lang", "中文"),
                     item.get("pages"), item.get("size", 0), item.get("date", ""), item.get("ext", "")),
                )
                conn.execute(
                    "INSERT INTO fts_index(work_path, filename, category, source, week) VALUES (?, ?, ?, ?, ?)",
                    (item["work_path"], item["filename"], item.get("category", ""), item.get("source", ""), item["week"]),
                )
            conn.commit()

    finally:
        conn.close()


# ============ Catalog Access ============

def get_catalog() -> list[dict]:
    """Return all catalog entries from SQLite."""
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT * FROM catalog ORDER BY week DESC, filename").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_catalog_by_wp() -> dict:
    """Return catalog indexed by work_path for O(1) lookup."""
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT * FROM catalog").fetchall()
        return {r["work_path"]: dict(r) for r in rows}
    finally:
        conn.close()


def catalog_count() -> int:
    conn = _get_conn()
    try:
        return conn.execute("SELECT COUNT(*) FROM catalog").fetchone()[0]
    finally:
        conn.close()


# ============ Full-Text Index ============

def build_full_index():
    """Rebuild FTS5 index from catalog table. Transaction-wrapped."""
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT work_path, filename, category, source, week FROM catalog").fetchall()
        conn.execute("BEGIN")
        try:
            conn.execute("DELETE FROM fts_index")
            for r in rows:
                conn.execute(
                    "INSERT INTO fts_index(work_path, filename, category, source, week) VALUES (?, ?, ?, ?, ?)",
                    (r["work_path"], r["filename"], r["category"], r["source"] or "", r["week"]),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        return len(rows)
    finally:
        conn.close()


def incremental_index(new_items: list[dict]):
    """Add new items to the FTS5 index without rebuilding."""
    if not new_items:
        return
    conn = _get_conn()
    try:
        conn.execute("BEGIN")
        try:
            for item in new_items:
                conn.execute(
                    "INSERT INTO fts_index(work_path, filename, category, source, week) VALUES (?, ?, ?, ?, ?)",
                    (item["work_path"], item["filename"], item.get("category", ""), item.get("source", ""), item["week"]),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    finally:
        conn.close()


def search(query: str, limit: int = 50) -> list[dict]:
    """Full-text search. Returns full catalog items via content= join."""
    q = query.strip()
    if not q:
        return []

    conn = _get_conn()
    try:
        try:
            rows = conn.execute(
                "SELECT * FROM catalog WHERE rowid IN (SELECT rowid FROM fts_index WHERE fts_index MATCH ? ORDER BY rank LIMIT ?)",
                (q, limit),
            ).fetchall()
        except sqlite3.OperationalError:
            simple_q = " OR ".join(f'"{w}"' for w in q.split() if len(w) > 1)
            if not simple_q:
                return []
            try:
                rows = conn.execute(
                    "SELECT * FROM catalog WHERE rowid IN (SELECT rowid FROM fts_index WHERE fts_index MATCH ? ORDER BY rank LIMIT ?)",
                    (simple_q, limit),
                ).fetchall()
            except sqlite3.OperationalError:
                return []

        return [dict(r) for r in rows]
    finally:
        conn.close()


def remove_from_index(work_path: str):
    """Remove a single entry from the FTS5 index by work_path."""
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM fts_index WHERE work_path = ?", (work_path,))
        conn.commit()
    finally:
        conn.close()


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


def remove_history_by_wp(work_path: str):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM history WHERE work_path = ?", (work_path,))
        conn.commit()
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


# ============ Statistics (SQL aggregate) ============

def get_source_stats() -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT cat_num, source, COUNT(*) as count FROM catalog WHERE source != '' "
            "GROUP BY cat_num, source ORDER BY count DESC"
        ).fetchall()
        return {"sources": [{"cat_num": r["cat_num"], "source": r["source"], "count": r["count"]} for r in rows]}
    finally:
        conn.close()


def get_weekly_stats() -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT week, cat_num, COUNT(*) as count FROM catalog "
            "GROUP BY week, cat_num ORDER BY week, cat_num"
        ).fetchall()
        return {"weekly": [{"week": r["week"], "cat_num": r["cat_num"], "count": r["count"]} for r in rows]}
    finally:
        conn.close()
