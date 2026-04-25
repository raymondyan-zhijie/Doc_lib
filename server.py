"""
Doc_Lib Catalog Browser — Entry Point

Usage:
    python server.py          # default port 8765
    python server.py 9000     # custom port
"""

import sys

from app.main import run_server

if __name__ == "__main__":
    port = 8765
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
