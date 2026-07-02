#!/usr/bin/env python3
"""Cockpit sync-server contract tests. Runs against a LOCAL wrangler pages dev
instance ONLY (refuses anything but localhost — never pollutes prod KV).

Covers every data-loss mode we've been burned by:
  auth, union merge (concurrent devices), rev-wins edits, tombstone deletes
  (incl. resurrection attempts from stale devices), global reset semantics,
  malformed/oversized payloads.

    python3 qa/qa_api.py http://localhost:8799
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8799"
if "localhost" not in BASE and "127.0.0.1" not in BASE:
    sys.exit("REFUSED: qa_api.py only runs against localhost (never prod KV)")

KEY = None
for line in (Path(__file__).resolve().parent.parent / ".dev.vars").read_text().splitlines():
    if line.startswith("SYNC_KEY="):
        KEY = line.split("=", 1)[1].strip()
assert KEY, "SYNC_KEY missing from .dev.vars"

PASS = []
FAIL = []


def req(method, key=KEY, body=None):
    r = urllib.request.Request(f"{BASE}/api/log", method=method,
                               data=body.encode() if isinstance(body, str) else body)
    if key is not None:
        r.add_header("x-sync-key", key)
    r.add_header("content-type", "application/json")
    try:
        resp = urllib.request.urlopen(r, timeout=15)
        return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def put(store, key=KEY):
    return req("PUT", key=key, body=json.dumps(store))


def get_store():
    code, body = req("GET")
    assert code == 200, f"GET failed: {code}"
    return json.loads(body)


def live(store, company):
    dead = store.get("__deleted", {})
    return [c for c in store.get(company, {}).get("calls", []) if not dead.get(str(c["ts"]))]


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  {'✓' if cond else '✗ FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))


Q = "QA::TestCo"      # test-only namespace
Q2 = "QA::OtherCo"

print(f"cockpit sync-server QA vs {BASE}")

# ── auth ──
code, _ = req("GET", key="WRONG")
check("GET wrong key -> 401", code == 401, f"got {code}")
code, _ = put({Q: {"calls": []}}, key="WRONG")
check("PUT wrong key -> 401", code == 401, f"got {code}")
code, _ = req("GET", key=None)
check("GET no key -> 401", code == 401, f"got {code}")

# ── clean the QA namespace via tombstones (idempotent setup) ──
s = get_store()
pre_tombs = {str(c["ts"]): True for co in (Q, Q2) for c in s.get(co, {}).get("calls", [])}
if pre_tombs:
    put({"__deleted": pre_tombs})

# ── union merge: two devices push different calls concurrently ──
put({Q: {"calls": [{"ts": 9001, "contact": "devA", "rev": 1}]}})
put({Q: {"calls": [{"ts": 9002, "contact": "devB", "rev": 1}]}})   # device B never saw 9001
s = get_store()
check("union: both devices' calls survive", {c["ts"] for c in live(s, Q)} >= {9001, 9002})

# ── rev-wins: field edit propagates, stale copy can't clobber it back ──
put({Q: {"calls": [{"ts": 9001, "contact": "devA-EDITED", "extra": "enriched", "rev": 2}]}})
put({Q: {"calls": [{"ts": 9001, "contact": "devA", "rev": 1}]}})   # stale device re-pushes old copy
s = get_store()
c9001 = next(c for c in live(s, Q) if c["ts"] == 9001)
check("rev-wins: edit sticks", c9001["contact"] == "devA-EDITED" and c9001.get("extra") == "enriched",
      f"got {c9001.get('contact')}")

# ── tombstone: delete sticks even when a stale device resurrects it ──
put({"__deleted": {"9002": True}})
put({Q: {"calls": [{"ts": 9002, "contact": "devB", "rev": 1}]}})   # stale device pushes the dead call again
s = get_store()
check("tombstone: deleted call stays dead", 9002 not in {c["ts"] for c in live(s, Q)})
check("tombstone: map persisted", s.get("__deleted", {}).get("9002") is True)

# ── granola carry: attaching granola without rev bump must not drop fields ──
put({Q: {"calls": [{"ts": 9001, "granola": {"id": "g1", "url": "u", "title": "t", "summary": "s"}}]}})
s = get_store()
c9001 = next(c for c in live(s, Q) if c["ts"] == 9001)
check("granola: attaches to existing call", (c9001.get("granola") or {}).get("id") == "g1")
check("granola: does NOT clobber existing fields", c9001["contact"] == "devA-EDITED")

# ── reset semantics: tombstone-all clears globally, later stale pushes stay dead ──
put({Q2: {"calls": [{"ts": 9100, "contact": "x", "rev": 1}]}})
s = get_store()
all_ts = {str(c["ts"]): True for co in (Q, Q2) for c in live(s, co)}
put({"__deleted": all_ts})
put({Q2: {"calls": [{"ts": 9100, "contact": "x", "rev": 1}]}})     # zombie push after reset
s = get_store()
check("reset: QA namespace fully dead incl. zombie pushes",
      not live(s, Q) and not live(s, Q2))

# ── payload hygiene ──
code, _ = req("PUT", body="{not json")
check("malformed JSON -> 400", code == 400, f"got {code}")
code, _ = req("PUT", body=json.dumps({"pad": "x" * 2_100_000}))
check("oversized body -> 413", code == 413, f"got {code}")

# ── size headroom: warn (not fail) if real store nears the 64KB keepalive limit ──
s = get_store()
size = len(json.dumps(s))
check("store under keepalive-safe 48KB (warn threshold)", size < 48_000, f"{size} bytes")

print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
