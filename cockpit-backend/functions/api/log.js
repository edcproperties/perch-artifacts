/* Cockpit persistence — NEON-BACKED (Magpie Postgres), row per call.
   Same contract the client has always spoken:
     GET  /api/log (x-sync-key) -> {company:{calls:[...],override},__deleted:{ts:true}}
     PUT  /api/log (x-sync-key) -> merge incoming store into rows; respond {saved,liveCalls}
   Row-level upserts kill the blob-race class entirely: devices can't clobber
   each other, deletes are a flag, edits are rev-gated. Tables: cockpit_calls
   (ts PK, company, rev, deleted, data jsonb), cockpit_overrides (company PK). */

import { neon } from "@neondatabase/serverless";

const TOMB = "__deleted";

const unauthorized = () =>
  new Response(JSON.stringify({ error: "bad sync key" }), {
    status: 401, headers: { "content-type": "application/json" },
  });

const ok = (body) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const authed = (request, env) =>
  env.SYNC_KEY && (request.headers.get("x-sync-key") || "") === env.SYNC_KEY;

export async function onRequestGet({ request, env }) {
  if (!authed(request, env)) return unauthorized();
  const sql = neon(env.DATABASE_URL);
  const [calls, overrides] = await Promise.all([
    sql`SELECT ts, company, rev, deleted, data FROM cockpit_calls`,
    sql`SELECT company, override FROM cockpit_overrides`,
  ]);
  const store = { [TOMB]: {} };
  for (const r of calls) {
    if (r.deleted) { store[TOMB][r.ts] = true; continue; }
    const co = r.company || "?";
    (store[co] = store[co] || { calls: [] }).calls.push({ ...r.data, ts: Number(r.ts), rev: r.rev });
  }
  for (const co of Object.keys(store)) {
    if (co !== TOMB) store[co].calls.sort((a, b) => a.ts - b.ts);
  }
  for (const o of overrides) {
    (store[o.company] = store[o.company] || { calls: [] }).override = o.override;
  }
  return ok(JSON.stringify(store));
}

export async function onRequestPut({ request, env }) {
  if (!authed(request, env)) return unauthorized();
  const body = await request.text();
  if (body.length > 2_000_000)
    return new Response(JSON.stringify({ error: "too large" }), { status: 413 });
  let incoming;
  try { incoming = JSON.parse(body); } catch {
    return new Response(JSON.stringify({ error: "not json" }), { status: 400 });
  }

  const sql = neon(env.DATABASE_URL);

  // gather incoming call ts -> fetch existing rows once
  const items = []; // {ts, company, call}
  for (const co of Object.keys(incoming)) {
    if (co === TOMB) continue;
    for (const c of (incoming[co] || {}).calls || []) {
      if (c && c.ts != null) items.push({ ts: Number(c.ts), company: co, call: c });
    }
  }
  const tsList = items.map((i) => i.ts);
  const existing = tsList.length
    ? await sql`SELECT ts, rev, deleted, data FROM cockpit_calls WHERE ts = ANY(${tsList})`
    : [];
  const byTs = new Map(existing.map((r) => [Number(r.ts), r]));

  const stmts = [];
  for (const { ts, company, call } of items) {
    const ex = byTs.get(ts);
    if (!ex) {
      stmts.push(sql`INSERT INTO cockpit_calls (ts, company, rev, deleted, data)
        VALUES (${ts}, ${company}, ${call.rev || 0}, FALSE, ${JSON.stringify(call)})
        ON CONFLICT (ts) DO NOTHING`);
    } else if (ex.deleted) {
      continue; // tombstone dominates — a stale device can never resurrect a delete
    } else if ((call.rev || 0) > (ex.rev || 0)) {
      stmts.push(sql`UPDATE cockpit_calls SET company=${company}, rev=${call.rev || 0},
        data=${JSON.stringify(call)}, updated_at=now() WHERE ts=${ts}`);
    } else if (call.granola && !(ex.data || {}).granola) {
      const patched = { ...ex.data, granola: call.granola };
      stmts.push(sql`UPDATE cockpit_calls SET data=${JSON.stringify(patched)}, updated_at=now() WHERE ts=${ts}`);
    }
  }
  for (const ts of Object.keys(incoming[TOMB] || {})) {
    stmts.push(sql`INSERT INTO cockpit_calls (ts, deleted, data)
      VALUES (${Number(ts)}, TRUE, ${JSON.stringify({ ts: Number(ts) })})
      ON CONFLICT (ts) DO UPDATE SET deleted=TRUE, updated_at=now()`);
  }
  for (const co of Object.keys(incoming)) {
    if (co === TOMB) continue;
    const ov = (incoming[co] || {}).override;
    if (ov) stmts.push(sql`INSERT INTO cockpit_overrides (company, override)
      VALUES (${co}, ${JSON.stringify(ov)})
      ON CONFLICT (company) DO UPDATE SET override=EXCLUDED.override, updated_at=now()`);
  }
  if (stmts.length) await sql.transaction(stmts);

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM cockpit_calls WHERE NOT deleted`;
  return ok(JSON.stringify({ saved: true, engine: "neon", liveCalls: n, bytes: body.length }));
}
