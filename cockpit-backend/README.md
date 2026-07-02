# Call Cockpit — backend (Cloudflare Pages Function + KV)

Deploys as its OWN Pages project **perch-call-cockpit** (perch-call-cockpit.pages.dev),
separate from perch-artifacts. These files are version-controlled here but the live
deploy dir is `~/Projects/perch-call-cockpit/` (git-untracked build target).

- `functions/api/log.js` — GET/PUT `/api/log`, gated by `x-sync-key` == Pages secret `SYNC_KEY`.
  PUT does a **server-side merge** (union calls by ts, union `__deleted` tombstones,
  higher `rev` wins, drop tombstoned) so concurrent device pushes never clobber.
- KV namespace `COCKPIT_KV`, blob key `cockpit-store-v1`.

Deploy: `cd ~/Projects/perch-call-cockpit && cp ~/Projects/perch-artifacts/perch-call-cockpit.html index.html && wrangler pages deploy . --project-name perch-call-cockpit --branch main`

Secret (NOT committed): `wrangler pages secret put SYNC_KEY --project-name perch-call-cockpit`
