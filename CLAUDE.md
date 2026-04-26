# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A local document catalog browser for ~16,200 research reports. FastAPI backend + single-page HTML frontend for browsing, filtering, full-text searching, favoriting, and batch-extracting files.

## Architecture (v3 — archive/work separation)

```
archives/          ← Original ZIPs (read-only, never modified)
work/              ← Fully extracted working copy (read-only, accessible by external tools)
app/
  main.py          — FastAPI app, lifespan lifecycle, structured logging
  config.py        — Constants (paths, CAT_MAP, MAX_UPLOAD_SIZE)
  models.py        — Pydantic models
  routes/
    api.py         — All API endpoints
  services/
    zip_service.py — File access: open, extract, serve, batch, upload (7-Zip only for archive extraction)
    index_service.py — SQLite FTS5 full-text search, favorites, history, statistics
    catalog_service.py — Catalog scanning and maintenance (scan_work_week)
server.py          — Entry point, terminal mode
Doc_Lib.pyw        — Desktop launcher (tkinter status window + browser)
browser.html       — Single-page frontend (all CSS/JS inline)
catalog.json       — File catalog (work_path = relative path within work/)
doclib.db          — SQLite (FTS5 index, favorites by work_path, history by work_path)
requirements.txt   — Python dependencies (pinned versions)
```

**Key decisions:**
- **Archives vs Work separation**: ZIPs live in `archives/` (read-only archive). All files are pre-extracted to `work/`. File access is instant — no 7-Zip extraction on open. `work/` can be browsed by external tools.
- **work_path as primary key**: Catalog, favorites, and history all use `work_path` (relative path within `work/`) as the unique file identifier. FTS5 index stores `work_path` as a column for stable O(1) dict lookup — no fragile rowid→position mapping.
- **zip_service.py is the security boundary**: All file paths validated against `WORK_DIR` or `BASE_DIR` via `_validate_path()` (`os.path.realpath()` + prefix check). No `shell=True` in subprocess calls; macOS/Linux uses `subprocess.run()`. Target directories (`/api/extract`, `/api/batch-extract`) also validated.
- **Catalog is cached in memory**: `catalog.json` loaded once and cached by mtime, with a `_catalog_by_wp` dict for O(1) work_path lookup. Cache access is lock-protected for thread safety.
- **doclib.db is disposable**: If corrupted, delete it and the server rebuilds on startup. Old FTS schemas auto-migrated.
- **Atomic catalog writes**: `scan_work_week()` writes to `.tmp` then `os.replace()` to prevent corruption on crash.
- **FTS rebuild uses transaction**: DELETE + INSERT wrapped in a single transaction so concurrent searches never see an empty index.

## Running

```bash
pip install -r requirements.txt
python server.py                        # terminal mode, Ctrl+C to stop
```

**Desktop launcher** (recommended): double-click `start_hidden.vbs` (Windows) or `Doc_Lib.pyw` (cross-platform). Opens browser + status window. Stop via status window "Stop Server".

API docs at `http://localhost:8765/docs`. Requires 7-Zip (auto-detected).

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/catalog` | GET | File catalog data (JSON, no-cache) |
| `POST /api/catalog/update?week_label=` | POST | Scan work/{week}/ and update catalog |
| `POST /api/open` | POST | Open file with system default app (body: `{work_path}`) |
| `POST /api/extract` | POST | Copy file to target directory (body: `{work_path, target_dir}`; validated within BASE_DIR) |
| `GET /api/file?work_path=` | GET | Serve file directly (browser preview) |
| `POST /api/batch-extract` | POST | Batch copy to target directory (target_dir validated) |
| `GET /api/batch-progress?task_id=` | GET | Batch progress |
| `POST /api/open-dir` | POST | Open directory in file explorer (body: `{path}`; validated within BASE_DIR) |
| `GET /api/config` | GET | Server config (extract_dir, platform, CSRF token) |
| `GET /api/search?q=&limit=` | GET | Metadata search (FTS5, work_path stable key) |
| `POST /api/rebuild-index` | POST | Rebuild FTS5 index from catalog (transaction-wrapped) |
| `GET /api/favorites` | GET | Get all favorites |
| `POST /api/favorites` | POST | Add favorite (work_path UNIQUE) |
| `DELETE /api/favorites?work_path=` | DELETE | Remove favorite |
| `GET /api/favorites/check?work_path=` | GET | Check if favorited |
| `GET /api/history?limit=` | GET | Browsing history (max 500 retained) |
| `GET /api/stats/sources` | GET | Source count statistics |
| `GET /api/stats/weekly` | GET | Weekly count statistics |
| `POST /api/upload` | POST | Upload one or more ZIPs (8 GB/file limit; Content-Length pre-check; per-file processing; single FTS rebuild) |
| `POST /api/shutdown` | POST | Graceful server shutdown |

## Data Layout

Each ZIP has 5 fixed subdirectories, preserved in `work/{week}/`:
- `01_重点报告-{N}份/` — Deep reports (20–200 pages)
- `02_国内券商报告-{N}份/` — Chinese broker research
- `03_投行报告-{N}份/` — International IB reports (English)
- `04_小报告-{N}份/` — Short briefs (5–20 pages)
- `05_杂货（培训课件、经管、统计数据）-{N}份/` — Misc

## Adding New Data

1. **Web UI** (recommended): Click **+** button → drag/drop one or more ZIPs → auto-detect week from filename → batch upload → auto-extract + index.
2. **Manual**: Place ZIP in `archives/`, extract to `work/{week}/`, restart server to rebuild index.
