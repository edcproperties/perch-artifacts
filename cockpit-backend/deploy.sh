#!/bin/bash
# Cockpit deploy gate — a deploy CANNOT ship without passing QA.
#   ./deploy.sh          full: sync HTML -> local QA -> deploy -> prod smoke
# Assumes: perch-artifacts holds the canonical HTML; .dev.vars holds SYNC_KEY.
set -euo pipefail
cd "$(dirname "$0")"
PORT=8799

echo "── 1/5 sync canonical HTML from perch-artifacts"
cp ~/Projects/perch-artifacts/perch-call-cockpit.html index.html
BUILD=$(grep -o "const BUILD = '[^']*'" index.html | cut -d"'" -f2)
echo "   build: $BUILD"

echo "── 2/5 build marker must be NEW (not already live in prod)"
if curl -sf "https://perch-call-cockpit.pages.dev/" | grep -q "$BUILD"; then
  echo "   ✗ BUILD '$BUILD' is already deployed — bump the BUILD constant"; exit 1
fi
echo "   ok — '$BUILD' not in prod yet"

echo "── 3/5 server-contract QA against local wrangler dev"
npx wrangler pages dev . --port $PORT --kv COCKPIT_KV >/tmp/cockpit_qa_dev.log 2>&1 &
DEV_PID=$!
trap 'kill $DEV_PID 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/log" || true)
  [ "$code" = "401" ] && break   # up + auth enforced
  sleep 1
  [ "$i" = "60" ] && { echo "   ✗ dev server never came up"; tail -5 /tmp/cockpit_qa_dev.log; exit 1; }
done
python3 qa/qa_api.py "http://localhost:$PORT"
kill $DEV_PID 2>/dev/null || true; trap - EXIT

echo "── 4/5 deploy"
npx wrangler pages deploy . --project-name perch-call-cockpit --branch main | tail -1

echo "── 5/5 prod smoke (retries for edge propagation)"
OK=""
for i in $(seq 1 12); do
  if curl -s "https://perch-call-cockpit.pages.dev/" | grep -q "$BUILD"; then OK=1; break; fi
  sleep 5
done
[ -n "$OK" ] || { echo "   ✗ prod not serving build $BUILD after 60s"; exit 1; }
curl -sI "https://perch-call-cockpit.pages.dev/" | grep -qi "cache-control: no-cache" || { echo "   ✗ no-cache header missing"; exit 1; }
code=$(curl -s -o /dev/null -w "%{http_code}" "https://perch-call-cockpit.pages.dev/api/log")
[ "$code" = "401" ] || { echo "   ✗ /api/log unauthenticated returned $code (want 401)"; exit 1; }
echo "   ✓ no-cache header · build $BUILD live · API auth enforced"
echo "PASS — deployed $BUILD"
