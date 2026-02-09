#!/usr/bin/env python3
"""
Cuboid Studio ↔ Grasshopper Bridge Server
==========================================

A lightweight local server that sits between the browser and Grasshopper.
The browser pushes assembly state via WebSocket; Grasshopper pulls it via HTTP.

Architecture:
    Browser (WebSocket ws://localhost:9876) ──▶ This server ◀── Grasshopper (HTTP GET :9876/state)

Start this before opening Cuboid Studio and Grasshopper:
    python cuboid_bridge_server.py
    python cuboid_bridge_server.py --port 9876    # custom port

Dependencies:
    pip install websockets
    (or: pip install websockets aiohttp)

What it does:
    1. Accepts WebSocket connections from the Cuboid Studio browser tab
    2. Stores the latest assembly JSON in memory
    3. Serves it via HTTP GET /state for Grasshopper's Python component to poll
    4. Optionally writes a .json file to disk (for GH File Watcher fallback)

The Grasshopper side:
    Use the companion 'cuboid_gh_receiver.py' GHPython component or
    any HTTP GET to http://localhost:9876/state
"""

import asyncio
import json
import argparse
import os
import time
from pathlib import Path

# We use the built-in http.server for the HTTP endpoint and websockets for WS
try:
    import websockets
except ImportError:
    print("=" * 60)
    print("Missing 'websockets' package. Install with:")
    print("  pip install websockets")
    print("=" * 60)
    raise SystemExit(1)

# ─── Global state ──────────────────────────────────────────────────────

latest_assembly: dict | None = None
last_update_time: float = 0
update_count: int = 0
connected_clients: set = set()

# ─── Configuration ─────────────────────────────────────────────────────

DEFAULT_PORT = 9876
JSON_FILE = None  # Set via --file flag to also write to disk


# ─── WebSocket handler (browser → server) ──────────────────────────────

async def ws_handler(websocket):
    global latest_assembly, last_update_time, update_count

    connected_clients.add(websocket)
    remote = websocket.remote_address
    print(f"[WS] Browser connected from {remote[0]}:{remote[1]}")

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "assembly_update":
                    latest_assembly = data["payload"]
                    last_update_time = time.time()
                    update_count += 1
                    cube_count = latest_assembly.get("cubeCount", "?")
                    print(f"[WS] Assembly update #{update_count}: {cube_count} cubes")

                    # Optionally write to disk
                    if JSON_FILE:
                        Path(JSON_FILE).write_text(
                            json.dumps(latest_assembly, indent=2),
                            encoding="utf-8"
                        )

            except json.JSONDecodeError:
                print(f"[WS] Invalid JSON received, ignoring")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[WS] Browser disconnected from {remote[0]}:{remote[1]}")


# ─── HTTP handler (Grasshopper → server) ───────────────────────────────

async def http_handler(reader, writer):
    """Minimal HTTP server for GH polling. Responds to GET /state."""
    request_line = await reader.readline()
    request_text = request_line.decode("utf-8", errors="replace").strip()

    # Read and discard headers
    while True:
        header_line = await reader.readline()
        if header_line == b"\r\n" or header_line == b"\n" or not header_line:
            break

    # Route
    if "GET /state" in request_text:
        if latest_assembly is None:
            body = json.dumps({"error": "no_data", "message": "No assembly received yet"})
            status = "204 No Content"
        else:
            body = json.dumps(latest_assembly)
            status = "200 OK"
    elif "GET /status" in request_text:
        body = json.dumps({
            "connected_browsers": len(connected_clients),
            "update_count": update_count,
            "last_update": last_update_time,
            "has_data": latest_assembly is not None,
        })
        status = "200 OK"
    elif "GET /" in request_text:
        body = json.dumps({
            "name": "Cuboid Studio Bridge Server",
            "version": "1.0",
            "endpoints": {
                "GET /state": "Latest assembly JSON",
                "GET /status": "Server status",
                "WebSocket /": "Browser push endpoint",
            },
        })
        status = "200 OK"
    else:
        body = json.dumps({"error": "not_found"})
        status = "404 Not Found"

    response = (
        f"HTTP/1.1 {status}\r\n"
        f"Content-Type: application/json\r\n"
        f"Access-Control-Allow-Origin: *\r\n"
        f"Content-Length: {len(body.encode())}\r\n"
        f"\r\n"
        f"{body}"
    )
    writer.write(response.encode())
    await writer.drain()
    writer.close()


# ─── Main ──────────────────────────────────────────────────────────────

async def main(port: int):
    # Start WebSocket server
    ws_server = await websockets.serve(ws_handler, "localhost", port)
    print(f"[Bridge] WebSocket listening on ws://localhost:{port}")

    # Start HTTP server on port+1
    http_port = port + 1
    http_server = await asyncio.start_server(http_handler, "localhost", http_port)
    print(f"[Bridge] HTTP listening on http://localhost:{http_port}")
    print(f"")
    print(f"  Browser connects to:    ws://localhost:{port}")
    print(f"  Grasshopper polls:      http://localhost:{http_port}/state")
    print(f"  Server status:          http://localhost:{http_port}/status")
    if JSON_FILE:
        print(f"  Also writing to file:   {JSON_FILE}")
    print(f"")
    print(f"Waiting for connections...")

    await asyncio.gather(
        ws_server.serve_forever(),
        http_server.serve_forever(),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cuboid Studio ↔ Grasshopper Bridge Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"WebSocket port (HTTP = port+1, default {DEFAULT_PORT})")
    parser.add_argument("--file", type=str, default=None, help="Also write assembly JSON to this file path")
    args = parser.parse_args()

    JSON_FILE = args.file

    try:
        asyncio.run(main(args.port))
    except KeyboardInterrupt:
        print("\n[Bridge] Shutting down...")
