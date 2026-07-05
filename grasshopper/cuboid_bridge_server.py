#!/usr/bin/env python3
"""
Cuboid Studio ↔ Grasshopper Bridge Server
==========================================

A tiny local relay between the browser and Grasshopper. Uses only the
Python standard library — no pip install needed.

Architecture:
    Browser ──POST /state──▶  This server  ◀──GET /state── Grasshopper

Start this before connecting from Cuboid Studio:
    python cuboid_bridge_server.py
    python cuboid_bridge_server.py --port 9876          # custom port
    python cuboid_bridge_server.py --file assembly.json # also write to disk

What it does:
    1. The Cuboid Studio browser tab POSTs the assembly JSON on every change
    2. The latest assembly is held in memory
    3. Grasshopper's Python component polls GET /state to read it
    4. Optionally mirrors the JSON to a file (for GH File Watcher fallback)

Endpoints (all on one port, default 9876):
    POST /state   — browser pushes assembly JSON (raw body)
    GET  /state   — latest assembly JSON (204 if nothing pushed yet)
    GET  /status  — {"update_count": ..., "has_data": ...}
    GET  /        — endpoint index
"""

import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_PORT = 9876

# ─── Shared state ──────────────────────────────────────────────────────

state_lock = threading.Lock()
latest_assembly: "bytes | None" = None  # raw JSON bytes as pushed
last_update_time: float = 0.0
update_count: int = 0
json_file: "str | None" = None


class BridgeHandler(BaseHTTPRequestHandler):
    # Quieter than the default two-line access log
    def log_message(self, fmt, *args):
        pass

    def _send(self, status: int, body: bytes = b"", content_type: str = "application/json"):
        self.send_response(status)
        # CORS: the browser tab (any origin, incl. the deployed HTTPS app)
        # must be allowed to talk to this localhost server.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        if body:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):  # CORS preflight
        self._send(204)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/state":
            with state_lock:
                body = latest_assembly
            if body is None:
                self._send(204)  # no assembly pushed yet
            else:
                self._send(200, body)
        elif path == "/status":
            with state_lock:
                body = json.dumps({
                    "update_count": update_count,
                    "last_update": last_update_time,
                    "has_data": latest_assembly is not None,
                }).encode()
            self._send(200, body)
        elif path == "/":
            body = json.dumps({
                "name": "Cuboid Studio Bridge Server",
                "version": "2.0",
                "endpoints": {
                    "POST /state": "Browser pushes assembly JSON",
                    "GET /state": "Latest assembly JSON",
                    "GET /status": "Server status",
                },
            }).encode()
            self._send(200, body)
        else:
            self._send(404, b'{"error": "not_found"}')

    def do_POST(self):
        global latest_assembly, last_update_time, update_count
        if self.path.split("?")[0] != "/state":
            self._send(404, b'{"error": "not_found"}')
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send(400, b'{"error": "invalid_json"}')
            return

        with state_lock:
            latest_assembly = body
            last_update_time = time.time()
            update_count += 1
            count = update_count
        cube_count = data.get("cubeCount", "?") if isinstance(data, dict) else "?"
        print(f"[Bridge] Assembly update #{count}: {cube_count} cubes")

        if json_file:
            try:
                Path(json_file).write_text(
                    json.dumps(data, indent=2), encoding="utf-8"
                )
            except OSError as e:
                print(f"[Bridge] Could not write {json_file}: {e}")

        self._send(200, b'{"ok": true}')


def main():
    global json_file
    parser = argparse.ArgumentParser(description="Cuboid Studio ↔ Grasshopper Bridge Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"Port for both browser and Grasshopper (default {DEFAULT_PORT})")
    parser.add_argument("--file", type=str, default=None,
                        help="Also write assembly JSON to this file path")
    args = parser.parse_args()
    json_file = args.file

    server = ThreadingHTTPServer(("localhost", args.port), BridgeHandler)
    print(f"[Bridge] Listening on http://localhost:{args.port}")
    print("")
    print(f"  Browser pushes to:   POST http://localhost:{args.port}/state")
    print(f"  Grasshopper polls:   GET  http://localhost:{args.port}/state")
    print(f"  Server status:       GET  http://localhost:{args.port}/status")
    if json_file:
        print(f"  Also writing to:     {json_file}")
    print("")
    print("Waiting for connections... (Ctrl+C to stop)")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Bridge] Shutting down...")


if __name__ == "__main__":
    main()
