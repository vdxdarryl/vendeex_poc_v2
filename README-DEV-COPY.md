# VendeeX 2.0 Demo — Development Copy

This folder is a **full copy** of the live app. Use this copy for all development and experiments. The **production** app remains unchanged in:

`VENDEEX 2.0/VendeeX 2.0 Demo/`

**Production is also connected to GitHub:** `vdxdarryl/vendeex_demo` — that repo is the source of truth for the live app. Do **not** push from this dev copy to that repo; keep production deploys and commits only from the original folder (or from a branch you merge into main after review).

## What was copied

- All source code (`website_for_deployment/`, `api/`, `netlify/`, `mcp-servers/`)
- Config files (`.env`, `.env.example`, `vercel.json`, `_redirects`)
- Supporting docs, assets, and data folders
- **Not** copied: `node_modules`, `.git`, `.netlify` (so this copy is independent and you reinstall/link as needed)

## Get the dev copy running

1. **Install dependencies** (in this folder’s web app):
   ```bash
   cd "VendeeX 2.0 Demo - dev/website_for_deployment"
   npm install
   ```

2. **Optional — use dev-only env**
   - Copy `.env.example` to `.env` in `website_for_deployment/` if you want a separate file.
   - Use dev/test API keys and a different port or DB so production is never touched.

3. **Run locally**
   ```bash
   npm start
   ```
   Or use `netlify dev` if you use Netlify locally.

4. **MCP server** (if you use it):
   ```bash
   cd "VendeeX 2.0 Demo - dev/mcp-servers/channel3-mcp"
   npm install
   ```

## Git / GitHub

- **Production repo:** `vdxdarryl/vendeex_demo` — the live app folder is linked to this. Pushes there can affect what’s deployed.
- **This dev copy (POC v2) repo:** `vdxdarryl/vendeex_poc_v2` — [https://github.com/vdxdarryl/vendeex_poc_v2](https://github.com/vdxdarryl/vendeex_poc_v2). Use this for backup and version control of the dev copy only.
- **First-time backup to GitHub:** Open Terminal, go to this folder, and run:
  ```bash
  cd "/Users/dr_darryl_carlton/Desktop/VENDEEX 2.0/VendeeX 2.0 Demo - dev"
  bash setup-github-backup.sh
  ```
  That script initializes Git (if needed), adds the remote, commits, and pushes to `vendeex_poc_v2`.
- **Later updates:** After making changes, run `git add -A && git commit -m "Your message" && git push` from this folder (or use Cursor’s Source Control).

## Deploying

- Do **not** deploy from this folder to your **production** site.
- To go live with changes: copy or merge changes back into `VendeeX 2.0 Demo/`, then build/deploy from there (or use a separate Netlify/Vercel “dev” site that points at this folder).

## Summary

| Use this copy for… | Use the original for… |
|--------------------|------------------------|
| Coding, testing, new features | Production deploys and live site |
| Experimenting without risk     | The app users actually use       |
