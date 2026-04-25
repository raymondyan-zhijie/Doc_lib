# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A local document catalog browser for ~16,200 research reports. FastAPI backend + single-page HTML frontend for browsing, filtering, full-text searching, favoriting, and batch-extracting files.

## Architecture (v3 — archive/work separation)

```
archives/          ← Original ZIPs (read-only, never modified)
work/              ← Fully extracted working copy (read-only, accessible by external tools)
app/
  main.py          — FastAPI app, startup lifecycle, exception handler
  config.py        — Constants (paths, CAT_MAP)
  models.py        — Pydantic models
  routes/
    api.py         — All API endpoints
  services/
    zip_service.py — File access: open, extract, serve, batch, upload (7-Zip only for archive extraction)
    index_service.py — SQLite FTS5 full-text search, favorites, history, statistics
server.py          — Entry point, terminal mode
Doc_Lib.pyw        — Desktop launcher (tkinter status window + browser)
browser.html       — Single-page frontend (all CSS/JS inline)
catalog.json       — File catalog (work_path = relative path within work/)
doclib.db          — SQLite (FTS5 index, favorites by work_path, history by work_path)
```

**Key decisions:**
- **Archives vs Work separation**: ZIPs live in `archives/` (read-only archive). All files are pre-extracted to `work/`. File access is instant — no 7-Zip extraction on open. `work/` can be browsed by external tools.
- **work_path as primary key**: Catalog, favorites, and history all use `work_path` (relative path within `work/`) as the unique file identifier.
- **zip_service.py is the security boundary**: All file paths validated against `WORK_DIR` via `os.path.realpath()`. No `shell=True` in subprocess calls.
- **FTS5 is content-less** (`content=''`): Index stores only tokens; search maps rowids back to catalog.json entries.
- **Catalog is cached in memory**: `catalog.json` loaded once and cached by mtime.
- **doclib.db is disposable**: If corrupted, delete it and the server rebuilds on startup.

## Running

```bash
pip install fastapi uvicorn pydantic python-multipart
python server.py                        # terminal mode, Ctrl+C to stop
```

**Desktop launcher** (recommended): double-click `start_hidden.vbs` (Windows) or `Doc_Lib.pyw` (cross-platform). Opens browser + status window. Stop via status window "Stop Server".

API docs at `http://localhost:8765/docs`. Requires 7-Zip (auto-detected).

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/catalog` | GET | File catalog data |
| `GET /api/open?work_path=` | GET | Open file with system default app |
| `GET /api/extract?work_path=` | GET | Copy file to .tmp/ |
| `GET /api/file?work_path=` | GET | Serve file directly (browser preview) |
| `POST /api/batch-extract` | POST | Batch copy to target directory |
| `GET /api/batch-progress?task_id=` | GET | Batch progress |
| `GET /api/search?q=` | GET | Full-text search (FTS5) |
| `POST /api/rebuild-index` | POST | Rebuild FTS5 index from catalog |
| `GET/POST/DELETE /api/favorites` | Various | Favorites (keyed by work_path) |
| `GET /api/history` | GET | Browsing history |
| `GET /api/stats/sources` | GET | Source count statistics |
| `GET /api/stats/weekly` | GET | Weekly count statistics |
| `POST /api/upload` | POST | Upload new ZIP (save to archives → extract to work → index) |
| `POST /api/shutdown` | POST | Graceful server shutdown |

## Data Layout

Each ZIP has 5 fixed subdirectories, preserved in `work/{week}/`:
- `01_重点报告-{N}份/` — Deep reports (20–200 pages)
- `02_国内券商报告-{N}份/` — Chinese broker research
- `03_投行报告-{N}份/` — International IB reports (English)
- `04_小报告-{N}份/` — Short briefs (5–20 pages)
- `05_杂货（培训课件、经管、统计数据）-{N}份/` — Misc

## Adding New Data

1. **Web UI** (recommended): Click **+** button → drag/drop ZIP → auto-extract + index.
2. **Manual**: Place ZIP in `archives/`, extract to `work/{week}/`, then `POST /api/catalog/update`.
