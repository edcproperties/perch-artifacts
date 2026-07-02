/* Cloud persistence for the call cockpit — one KV blob, token-gated.
   GET  /api/log   (X-Sync-Key) -> the shared store JSON
   PUT  /api/log   (X-Sync-Key) -> replace the shared store (client merges first)
   The client keeps localStorage as an offline cache and pushes debounced
   snapshots here, so a browser crash / cleared storage / new device never
   loses the log. Bridge solution until this lives in Perch proper. */

const KEY = "cockpit-store-v1";

function unauthorized() {
  return new Response(JSON.stringify({ error: "bad sync key" }), {
    status: 401, headers: { "content-type": "application/json" },
  });
}

function ok(body) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function authed(request, env) {
  const k = request.headers.get("x-sync-key") || "";
  return env.SYNC_KEY && k === env.SYNC_KEY;
}

export async function onRequestGet({ request, env }) {
  if (!authed(request, env)) return unauthorized();
  const v = await env.COCKPIT_KV.get(KEY);
  return ok(v || "{}");
}

const TOMB = "__deleted";

/* Server-side merge so concurrent device pushes can never clobber each other
   (whole-store replace + two live tabs = last-write-wins data loss). Union calls
   by ts, union tombstone maps, higher `rev` wins on same-ts edits, drop any
   tombstoned call. Mirrors the client mergeStores(). incoming(b) folds into
   current(a). */
function mergeStores(a, b) {
  const out = JSON.parse(JSON.stringify(a || {}));
  out[TOMB] = Object.assign({}, (a || {})[TOMB] || {}, (b || {})[TOMB] || {});
  Object.keys(b || {}).forEach((k) => {
    if (k === TOMB) return;
    const src = b[k] || {}, dst = (out[k] = out[k] || { calls: [] });
    const byTs = new Map((dst.calls || []).map((c) => [c.ts + "", c]));
    (src.calls || []).forEach((c) => {
      const ex = byTs.get(c.ts + "");
      if (!ex) { (dst.calls = dst.calls || []).push(c); byTs.set(c.ts + "", c); }
      else if ((c.rev || 0) > (ex.rev || 0)) { Object.assign(ex, c); }
      else if (c.granola && !ex.granola) { ex.granola = c.granola; }
    });
    (dst.calls || []).sort((x, y) => x.ts - y.ts);
    if (src.override) dst.override = Object.assign({}, src.override, dst.override || {});
  });
  Object.keys(out).forEach((k) => {
    if (k === TOMB || !out[k] || !out[k].calls) return;
    out[k].calls = out[k].calls.filter((c) => !out[TOMB][c.ts]);
  });
  return out;
}

export async function onRequestPut({ request, env }) {
  if (!authed(request, env)) return unauthorized();
  const body = await request.text();
  if (body.length > 2_000_000) {
    return new Response(JSON.stringify({ error: "too large" }), { status: 413 });
  }
  let incoming;
  try { incoming = JSON.parse(body); } catch {
    return new Response(JSON.stringify({ error: "not json" }), { status: 400 });
  }
  const cur = JSON.parse((await env.COCKPIT_KV.get(KEY)) || "{}");
  const merged = mergeStores(cur, incoming);
  const out = JSON.stringify(merged);
  await env.COCKPIT_KV.put(KEY, out);
  const live = Object.keys(merged).filter((k) => k !== TOMB)
    .reduce((n, k) => n + (merged[k].calls || []).length, 0);
  return ok(JSON.stringify({ saved: true, merged: true, liveCalls: live, bytes: out.length }));
}
