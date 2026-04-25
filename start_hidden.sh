#!/bin/bash
# Doc_Lib Launcher for macOS / Linux
# Usage: ./start_hidden.sh
# Opens a status window + browser. Click ⏻ in the browser to stop.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

python3 Doc_Lib.pyw &
echo "Doc_Lib launching... (PID $!). Open http://localhost:8765 if browser doesn't auto-open."
