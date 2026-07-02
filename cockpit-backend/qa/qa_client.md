# Cockpit client-side QA — run via the Claude preview harness after ANY UI change

Server contract is covered by `qa_api.py` (run automatically by `deploy.sh`).
These are the browser-level checks, driven with `preview_start` (config
`cockpit-dev`, port 8788) + `preview_eval`. Each one exists because it caught
a real data-loss or trust bug.

Setup per run: `localStorage.clear()`, set `perch-cockpit-sync-key` +
`-asked`, reload.

1. **Fresh device pull** — empty localStorage + key → store populated from
   cloud, history renders, badge `☁ synced · N calls`.
2. **Log → server receipt** — select company, fill fields, outcome, `saveCall()`
   → toast must show `✓ saved to cloud — N calls total` (N from the SERVER
   response, not local math); cloud GET contains the entry.
3. **Receipt failure honesty** — with a bogus sync key, `saveCall()` toast must
   show the red "THIS DEVICE ONLY" warning, badge `☁ SYNC ERROR`.
4. **Draft autosave / tab-switch** — type into capture form, dispatch
   `visibilitychange` hidden→visible (triggers pull + re-render) → typed
   values intact.
5. **Draft autosave / reload** — type, `location.reload()`, reselect company →
   values restored; after `saveCall()` draft cleared.
6. **Stale-device convergence** — seed localStorage with known dupes, cloud
   with tombstones → after pull exactly the live set renders; device's own
   push does NOT resurrect (GET cloud, tombstones intact).
7. **Reset** — `resetAll()` (accept confirm) → all calls tombstoned in cloud,
   zombie re-push stays dead.
8. **Counters exclude tombstones** — header Dialed/Calls/Productive match the
   live (non-tombstoned) set only; `__deleted` never appears as a company.

9. **History-first layout (THE rule: saved notes stay on screen, every call
   is its own entry)** — company with saved calls opens with the CALL HISTORY
   block at TOP (count + latest call's full notes + collapsed earlier calls),
   then the capture form labeled "NEW CALL · #N" with the never-overwrites
   note; after `saveCall()` the count increments, the just-saved notes appear
   at the top, panel scrolls to top, form resets labeled #N+1; fresh company
   shows "this will be call #1" and no history block.
