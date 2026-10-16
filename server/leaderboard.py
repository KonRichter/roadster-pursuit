#!/usr/bin/env python3
"""Roadster Pursuit leaderboard API (stdlib only: http.server + sqlite3).

  GET  /api/leaderboard?limit=10   -> {"entries": [{rank, name, score, distance, date}]}
  POST /api/scores {name, score, distance} -> {"rank": n, "entries": [...]}

Production: runs behind nginx on 127.0.0.1, nginx serves the static game.
Local dev:  python3 server/leaderboard.py --static .   (serves the game too)
"""
import argparse
import json
import mimetypes
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

NAME_RE = re.compile(r"^[\w .\-]{2,16}$", re.UNICODE)
MAX_SCORE = 5_000_000
SUBMIT_COOLDOWN = 8  # seconds between submissions per IP

_lock = threading.Lock()
_last_submit = {}


def connect(path):
    db = sqlite3.connect(path, check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute(
        """CREATE TABLE IF NOT EXISTS scores (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL,
             score INTEGER NOT NULL,
             distance REAL NOT NULL,
             created_at TEXT NOT NULL DEFAULT (datetime('now'))
           )"""
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC)")
    db.commit()
    return db


def top(db, limit):
    # best run per nickname (case-insensitive)
    rows = db.execute(
        """SELECT name, score, distance, created_at FROM (
             SELECT name, score, distance, created_at,
                    ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY score DESC, id) AS rn
             FROM scores)
           WHERE rn = 1 ORDER BY score DESC, created_at LIMIT ?""",
        (limit,),
    ).fetchall()
    return [
        {"rank": i + 1, "name": r[0], "score": r[1], "distance": round(r[2], 2), "date": r[3][:10]}
        for i, r in enumerate(rows)
    ]


def rank_of(db, score):
    (better,) = db.execute(
        """SELECT COUNT(*) FROM (SELECT lower(name) n, MAX(score) s FROM scores GROUP BY lower(name))
           WHERE s > ?""",
        (score,),
    ).fetchone()
    return better + 1


class Handler(BaseHTTPRequestHandler):
    db = None
    static_root = None
    server_version = "RoadsterPursuit/1.0"

    def log_message(self, fmt, *args):  # quieter logs
        if os.environ.get("LB_VERBOSE"):
            super().log_message(fmt, *args)

    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def client_ip(self):
        return self.headers.get("X-Real-IP") or self.client_address[0]

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/leaderboard":
            q = parse_qs(url.query)
            try:
                limit = max(1, min(50, int(q.get("limit", ["10"])[0])))
            except ValueError:
                limit = 10
            with _lock:
                entries = top(self.db, limit)
            return self.send_json(200, {"entries": entries})
        if url.path == "/api/health":
            return self.send_json(200, {"ok": True})
        if self.static_root:
            return self.serve_static(url.path)
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/scores":
            return self.send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 2048:
                return self.send_json(413, {"error": "too large"})
            data = json.loads(self.rfile.read(length) or b"{}")
            name = " ".join(str(data.get("name", "")).split())
            score = int(data.get("score", -1))
            distance = float(data.get("distance", -1))
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.send_json(400, {"error": "invalid payload"})

        if not NAME_RE.match(name):
            return self.send_json(400, {"error": "Nickname: 2-16 letters, numbers, space, . _ -"})
        # plausibility: score comes mostly from distance plus capped bonuses
        if not (0 <= score <= MAX_SCORE) or not (0 <= distance <= 2000) or score > distance * 12000 + 3000:
            return self.send_json(400, {"error": "score rejected"})

        ip = self.client_ip()
        now = time.time()
        with _lock:
            if now - _last_submit.get(ip, 0) < SUBMIT_COOLDOWN:
                return self.send_json(429, {"error": "slow down"})
            _last_submit[ip] = now
            self.db.execute("INSERT INTO scores (name, score, distance) VALUES (?, ?, ?)", (name, score, distance))
            self.db.commit()
            rank = rank_of(self.db, score)
            entries = top(self.db, 10)
        self.send_json(200, {"rank": rank, "entries": entries})

    def serve_static(self, path):
        root = Path(self.static_root).resolve()
        target = (root / path.lstrip("/")).resolve()
        if target.is_dir():
            target = target / "index.html"
        if root not in target.parents and target != root or not target.is_file():
            return self.send_json(404, {"error": "not found"})
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=int(os.environ.get("LB_PORT", 3010)))
    ap.add_argument("--db", default=os.environ.get("LB_DB", "leaderboard.sqlite"))
    ap.add_argument("--static", default=None, help="also serve the game from this folder (local dev)")
    args = ap.parse_args()
    Handler.db = connect(args.db)
    Handler.static_root = args.static
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"leaderboard on http://{args.host}:{args.port}  db={args.db}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
