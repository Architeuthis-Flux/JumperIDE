# JumperIDE Script Registry Worker

Cloudflare Worker that backs the shared script registry: no-account uploads (author name + description), wiki-style edits, and immutable history.

## Setup

1. Install Wrangler: `npm i -g wrangler` or use `npx wrangler`.
2. Create KV namespaces:
   - `npx wrangler kv namespace create SCRIPTS`
   - `npx wrangler kv namespace create SCRIPTS --preview` (for `wrangler dev`)
3. Copy the returned IDs into `wrangler.toml`: set `id` and `preview_id` under `[[kv_namespaces]]`.
4. Deploy: `npx wrangler deploy`.
5. Optionally set a custom domain and CORS in the Worker or via Cloudflare dashboard.

## API

- `GET /scripts` — List all scripts (id, name, description, authorName, updatedAt).
- `GET /scripts/:id` — Get one script with content.
- `GET /scripts/:id/history` — List revisions (metadata only).
- `GET /scripts/:id/revisions/:revId` — Get one revision (full content).
- `POST /scripts` — Create. Body: `{ name, description, authorName, content }`.
- `PUT /scripts/:id` — Update (wiki-style). Body: `{ name?, description?, authorName, content? }`.

All responses are JSON. CORS allows `*`. Rate limit: 30 POST/PUT per minute per IP.

## Verification checklist (after deploy)

1. **Build JumperIDE with registry URL:**  
   `SCRIPT_REGISTRY_API_BASE=https://jumperscripts.kevinc-af9.workers.dev npm run build` (or your custom domain).

2. **List:** Open the Scripts tab; you should see "Upload script" and any existing scripts (or "No scripts yet").

3. **Upload:** Click "Upload script", fill name, your name, description, and code; click Upload. The list should refresh and show the new script.

4. **Open:** Click a script row (or the open icon) to load it into the editor.

5. **Edit:** Click the pen icon on a script, change fields, Save. Re-open the script and confirm changes.

6. **History:** Click the history icon, then "Load" on an older revision; it should open in a new tab.

7. **Cross-client:** From another browser or device (same deployed app URL), confirm the list shows the same scripts and that edits appear after refresh.

8. **Errors:** Submit with empty "Your name" or "Description" and confirm a friendly validation message; hit rate limit (30+ uploads/edits in a minute) and confirm a "Too many requests" message.

## Sync registry ↔ repo

**Registry → repo (see uploaded scripts locally)**  
Pull all scripts from the registry into `scripts/`:

```bash
cd cloudflare/script-registry-worker
node sync-registry-to-repo.js
```

Or from repo root: `node cloudflare/script-registry-worker/sync-registry-to-repo.js`

- Uses `REGISTRY_URL` from the environment if set (default: `https://jumperscripts.kevinc-af9.workers.dev`).
- Writes each script to `scripts/<name>.py` and stores a `.registry-sync.json` manifest (id → filename, and per-file description/author for push).
- **Automatic:** The GitHub Action "Sync registry scripts" runs every 6 hours and on manual trigger (Actions tab); it runs this sync and commits changes so uploaded scripts appear in the repo.

**Repo → registry (publish your edits)**  
After editing `.py` files in `scripts/`, push those changes back to the registry:

```bash
cd cloudflare/script-registry-worker
node push-repo-to-registry.js
```

- Only pushes files that are in `.registry-sync.json` (i.e. were previously synced from the registry).
- Uses each script’s stored description/author from the manifest. If missing, set env: `AUTHOR_NAME="Your Name" DESCRIPTION="Short description"`.
- Optional: `REGISTRY_URL=...` to point at a different registry.
