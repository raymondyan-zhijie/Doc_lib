"""
Doc_Lib Desktop Launcher
Double-click this file (or run: python Doc_Lib.pyw) to start without a terminal.
Shows a small status window — use the Stop button to exit.
"""

import io
import os
import sys
import threading
import traceback
import webbrowser

# pythonw.exe has no console — sys.stdout/stderr are None.
# uvicorn's logging formatter calls sys.stdout.isatty() and crashes if stdout is None.
if sys.stdout is None:
    sys.stdout = io.TextIOWrapper(open(os.devnull, "wb", buffering=0), encoding="utf-8")
if sys.stderr is None:
    sys.stderr = io.TextIOWrapper(open(os.devnull, "wb", buffering=0), encoding="utf-8")

# Ensure the project root is on sys.path
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

import uvicorn
from app.main import app
from app import config as app_config
from app.config import DEFAULT_PORT

LOG_PATH = os.path.join(PROJECT_DIR, "launcher.log")


def _log(msg):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass


def _run_console_mode(port):
    """Fallback when tkinter is unavailable — runs like server.py with console."""
    print(f"Doc_Lib v3.0 — http://localhost:{port}")
    print("Press Ctrl+C to stop.")
    webbrowser.open(f"http://localhost:{port}")
    uv_config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(uv_config)
    app_config._uvicorn_server = server
    server.run()


try:
    import tkinter as tk
    from tkinter import messagebox
    _HAS_TK = True
except ImportError:
    _HAS_TK = False


if _HAS_TK:
    class DocLibLauncher:
        def __init__(self, port=DEFAULT_PORT):
            self.port = port
            self.server_started = threading.Event()
            self.shutdown_requested = threading.Event()
            self.root = None
            self._build_ui()

        def _build_ui(self):
            self.root = tk.Tk()
            self.root.title("Doc_Lib")
            self.root.geometry("300x180")
            self.root.resizable(False, False)
            self.root.protocol("WM_DELETE_WINDOW", self._on_close)

            self.root.update_idletasks()
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            x = sw - 320
            y = sh - 220
            self.root.geometry(f"300x180+{x}+{y}")

            # -- Header --
            header = tk.Frame(self.root)
            header.pack(pady=(16, 8))
            self.status_dot = tk.Canvas(header, width=12, height=12, highlightthickness=0)
            self.status_dot.pack(side=tk.LEFT, padx=(0, 8))
            self._draw_dot("gray")
            self.status_label = tk.Label(header, text="Starting...", font=("Segoe UI", 11, "bold"))
            self.status_label.pack(side=tk.LEFT)

            # -- URL --
            self.url_label = tk.Label(
                self.root, text=f"http://localhost:{self.port}",
                font=("Segoe UI", 9), fg="#0071e3", cursor="hand2",
            )
            self.url_label.pack(pady=(0, 8))
            self.url_label.bind("<Button-1>", lambda e: webbrowser.open(f"http://localhost:{self.port}"))

            # -- Buttons --
            btn_frame = tk.Frame(self.root)
            btn_frame.pack(pady=(4, 8))
            tk.Button(
                btn_frame, text="Open Browser", width=13,
                command=lambda: webbrowser.open(f"http://localhost:{self.port}"),
            ).pack(side=tk.LEFT, padx=4)
            self.stop_btn = tk.Button(
                btn_frame, text="Stop Server", width=13,
                command=self._on_close,
            )
            self.stop_btn.pack(side=tk.LEFT, padx=4)

            # -- Footer --
            self.footer = tk.Label(self.root, text="", font=("Segoe UI", 8), fg="#888")
            self.footer.pack(pady=(0, 8))

            threading.Thread(target=self._run_server, daemon=True).start()
            self.root.after(200, self._check_ready)

        def _draw_dot(self, color):
            self.status_dot.delete("all")
            self.status_dot.create_oval(1, 1, 11, 11, fill=color, outline="")

        def _run_server(self):
            try:
                uv_config = uvicorn.Config(app, host="127.0.0.1", port=self.port, log_level="warning")
                server = uvicorn.Server(uv_config)
                app_config._uvicorn_server = server
                self.server_started.set()
                server.run()
                if self.root:
                    self.root.after(0, self._on_server_stopped)
            except Exception as e:
                _log(f"_run_server: EXCEPTION {e}\n{traceback.format_exc()}")
                self.server_started.set()
                self.root.after(0, lambda: self._on_error(str(e)))

        def _check_ready(self):
            import socket
            if self.server_started.is_set():
                try:
                    s = socket.create_connection(('127.0.0.1', self.port), timeout=0.5)
                    s.close()
                except OSError:
                    self.root.after(300, self._check_ready)
                    return
                self._draw_dot("#34c759")
                self.status_label.config(text="Running")
                self.footer.config(text="Click Stop to exit")
                if not hasattr(self, '_browser_opened'):
                    self._browser_opened = True
                    self.root.after(200, lambda: webbrowser.open(f"http://localhost:{self.port}"))
            else:
                self.root.after(200, self._check_ready)

        def _on_error(self, err_msg):
            self._draw_dot("red")
            self.status_label.config(text="Error")
            self.footer.config(text=err_msg[:80])

        def _on_server_stopped(self):
            self._draw_dot("gray")
            self.status_label.config(text="Server Stopped")
            self.stop_btn.config(text="Close", command=self.root.destroy)
            self.footer.config(text="You can close this window now")

        def _on_close(self):
            if self.shutdown_requested.is_set():
                return
            if messagebox.askokcancel("Stop Doc_Lib", "Stop the server and exit?"):
                self.shutdown_requested.set()
                self.status_label.config(text="Stopping...")
                self._draw_dot("#ff9500")
                self.stop_btn.config(state=tk.DISABLED)
                self.footer.config(text="Shutting down...")
                self.root.update()
                server = getattr(app_config, '_uvicorn_server', None)
                if server:
                    server.should_exit = True
                self.root.after(800, self.root.destroy)

        def run(self):
            self.root.mainloop()


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    if _HAS_TK:
        DocLibLauncher(port=port).run()
    else:
        _run_console_mode(port)


if __name__ == "__main__":
    main()

