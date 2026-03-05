# VendeeX 2.0 - Netlify Deployment Guide

## Quick Deploy Steps

### 1. Create a Netlify Account
Go to [netlify.com](https://www.netlify.com) and sign up (free tier works fine).

### 2. Deploy via GitHub (Recommended)

**Option A: Connect to GitHub**
1. Push this project to a GitHub repository
2. In Netlify dashboard, click "Add new site" > "Import an existing project"
3. Choose GitHub and select your repository
4. Deploy settings will be auto-detected from `netlify.toml`
5. Click "Deploy site"

**Option B: Drag & Drop**
1. In Netlify dashboard, click "Add new site" > "Deploy manually"
2. Drag the entire `VendeeX 2.0 Demo` folder into the upload area
3. Wait for deployment to complete

### 3. Configure Environment Variable (Required for AI Search)

1. Go to your site in Netlify dashboard
2. Click **Site settings** > **Environment variables**
3. Click **Add a variable**
4. Set:
   - **Key:** `PERPLEXITY_API_KEY`
   - **Value:** Your Perplexity API key (get one at https://www.perplexity.ai/settings/api)
5. Click **Save**
6. **Redeploy** your site (Deploys > Trigger deploy > Deploy site)

### 4. Access Your Site

Your site will be available at: `https://[your-site-name].netlify.app`

You can add a custom domain in Site settings > Domain management.

---

## Project Structure for Netlify

```
VendeeX 2.0 Demo/
├── netlify.toml              # Netlify configuration
├── netlify/
│   └── functions/
│       └── search.js         # Serverless API function
├── index.html                # Landing page
├── pages/                    # HTML pages
├── css/                      # Stylesheets
├── js/                       # Frontend JavaScript
└── ...
```

## How It Works

- **Static files** (HTML, CSS, JS) are served directly from Netlify's CDN
- **API calls** to `/api/search` are redirected to the serverless function
- The serverless function calls the Perplexity API and returns results
- No server required - everything runs on Netlify's infrastructure

## Troubleshooting

### "API key not configured" error
- Make sure you added `PERPLEXITY_API_KEY` in Netlify environment variables
- Redeploy after adding the variable

### Function not working
- Check Netlify Functions logs: Site > Functions > search
- Verify the function deployed: Deploys > [latest] > Deploy summary

### CORS errors
- The function includes CORS headers - this should work automatically
- If issues persist, check browser console for specific errors

## Local Development

You can still run locally with the original Node.js server:

```bash
npm install
npm start
```

Or test with Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

## Costs

- **Netlify Free Tier:** 125,000 function invocations/month
- **Perplexity API:** Pay per request (~$5/1000 searches with sonar-pro)

For a demo site, the free tier is more than sufficient.
