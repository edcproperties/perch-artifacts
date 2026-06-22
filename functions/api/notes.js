// Pages Function: server-side persistence for the artifact's per-category notes.
// GET  /api/notes        -> { [categoryId]: text }
// POST /api/notes  body  -> { id, value }  (value === "" or null deletes)
const KEY = "notes";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function onRequestGet({ env }) {
  if (!env.NOTES_KV) return json({});
  const data = await env.NOTES_KV.get(KEY);
  return new Response(data || "{}", {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.NOTES_KV) return json({ ok: false, error: "no_store" }, 501);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  const { id, value } = body || {};
  if (typeof id !== "string" || !id) return json({ ok: false, error: "missing_id" }, 400);

  const current = JSON.parse((await env.NOTES_KV.get(KEY)) || "{}");
  if (value === null || value === undefined || value === "") {
    delete current[id];
  } else {
    current[id] = String(value).slice(0, 5000);
  }
  await env.NOTES_KV.put(KEY, JSON.stringify(current));
  return json({ ok: true });
}
