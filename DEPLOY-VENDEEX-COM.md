# Deploy VendeeX to www.vendeex.com

Step-by-step guide to get the dev app live at **www.vendeex.com** using **Railway** and GoDaddy DNS.

---

## What you need before starting

- Your **GitHub** account (repo: **vdxdarryl/vendeex_poc_v2**).
- A **Railway** account: [railway.app](https://railway.app) → Sign up or Log in.
- **GoDaddy** access for vendeex.com (where the domain is registered).
- Your **API keys** (Channel3, Affiliate.com, Perplexity, Anthropic, OpenAI) — same as for the current demo. You’ll add these as environment variables in Railway.

---

## Part 1: Push your latest code to GitHub

1. On your Mac, open **Terminal**.
2. Go to the dev folder:
   ```bash
   cd "/Users/dr_darryl_carlton/Desktop/VENDEEX 2.0/VendeeX 2.0 Demo - dev"
   ```
3. See if anything changed:
   ```bash
   git status
   ```
4. If there are changes, save them to GitHub:
   ```bash
   git add -A
   git commit -m "Prepare for vendeex.com deployment"
   git push origin main
   ```
   (If it says "nothing to commit", you can skip to Part 2.)

---

## Part 2: Create the project in Railway

1. Go to **[railway.app](https://railway.app)** and log in.
2. Click **"New Project"** (or **"Start a New Project"**).
3. Choose **"Deploy from GitHub repo"** and connect your GitHub account if needed. Select the repo **vdxdarryl/vendeex_poc_v2**.
4. Railway will create a new **service** from the repo. Before or after the first deploy, open the service and go to **Settings** (or the service’s **Settings** tab).
5. Set the **Root Directory** (or **Source** → **Root Directory**) to **`website_for_deployment`**. That’s where `server.js` and `package.json` live. Without this, Railway may look at the repo root and fail to find the app.
6. **Build command:** leave default (often **`npm install`** or empty; Railway will run `npm install` if it sees `package.json` in the root directory).
7. **Start command:** leave as **`npm start`** (or **`node server.js`**). That runs your Express server.
8. **Environment variables:** In the service, go to **Variables** (or **Environment**). Add the same variables you use for the current demo (from your existing `.env`), for example:
   - `CHANNEL3_API_KEY`
   - `AFFILIATE_COM_API_KEY`
   - `PERPLEXITY_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `DATABASE_URL` (if you use PostgreSQL)
   - `PORT` — Railway sets this automatically; you can leave it unset or set it to `3000` if your app expects it.  
   Copy names from **website_for_deployment/.env.example** and paste values from your current **.env** (do not commit the real `.env` file).
9. Trigger a **deploy** (or wait for the first one to finish). Railway will give you a URL like **your-app-name.up.railway.app**. Open it and check that the app loads and search works. If something breaks, fix it before adding the custom domain.

---

## Part 3: Add www.vendeex.com (and optionally vendeex.com) in Railway

1. In Railway, open your **service** (the VendeeX app).
2. Go to **Settings** → **Networking** or **Public Networking** (or the **Domains** / **Custom Domain** section).
3. Click **Add custom domain** (or **Generate domain** first if you want to see the default Railway URL, then add custom domain).
4. Enter **www.vendeex.com** and add it. Railway will show you the **CNAME** target to use (e.g. **your-app.up.railway.app** or a specific value they provide). **Copy this** — you’ll add it in GoDaddy.
5. If you also want **vendeex.com** (without www): add **vendeex.com** in Railway. They may give you the same CNAME or specific instructions. Note: GoDaddy does not support CNAME at the root (@). So for **vendeex.com** you may need to either use **www only** and redirect root to www, or use a DNS provider that supports CNAME flattening (e.g. Cloudflare) for the root. For a simple setup, **www.vendeex.com** is enough; you can point **vendeex.com** to www later if you change DNS.

---

## Part 4: Point www.vendeex.com at Railway in GoDaddy

1. Log in at **[godaddy.com](https://www.godaddy.com)** and open **My Products** (or **Domains**).
2. Click **vendeex.com** → **DNS** (or **Manage DNS**).
3. Add or edit a **CNAME** record:
   - **Name / Host:** `www` (or `www.vendeex.com` depending on GoDaddy’s form).
   - **Type:** CNAME
   - **Value / Points to:** the value Railway gave you (e.g. **your-app.up.railway.app**). Do not include `https://` or a trailing slash.
4. Remove any old **A** or **CNAME** record for **www** that pointed somewhere else, or it will conflict.
5. Save. DNS can take a few minutes up to 24–48 hours; often 10–30 minutes.

---

## Part 5: HTTPS

Railway usually provisions a **free SSL certificate** for your custom domain once DNS is pointing to them. After the CNAME has propagated, check your service’s **Domains** or **Networking** section; it should show the certificate as active. Then **https://www.vendeex.com** should work.

---

## Checklist

- [ ] Code pushed to **vdxdarryl/vendeex_poc_v2** (main).
- [ ] New Railway project created from that repo.
- [ ] **Root directory** set to **website_for_deployment**.
- [ ] Environment variables added in Railway (same as current demo).
- [ ] First deploy succeeded and ***.up.railway.app** works.
- [ ] Custom domain **www.vendeex.com** added in Railway.
- [ ] CNAME for **www** in GoDaddy points to Railway’s value.
- [ ] **https://www.vendeex.com** opens the app and search/chat work.

---

## If something goes wrong

- **Build or start fails:** Check the deploy logs in Railway. The most common fix is setting **Root Directory** to **website_for_deployment**.
- **Site is blank or 404:** Confirm the root directory is correct and that **website_for_deployment** contains **server.js**, **package.json**, and your static files (e.g. **index.html**).
- **API errors (search/chat don’t work):** Check that all required env vars are set in Railway (Variables tab) and match your working `.env`.
- **Domain not loading:** Wait for DNS to propagate, then in GoDaddy double-check the **www** CNAME value matches exactly what Railway shows (no typos, no `https://`).

Once **https://www.vendeex.com** is live and behaving like the demo, you’re done with step 3; next is confirming outcomes (step 4) and then Phase 4 (RunPod chat).
