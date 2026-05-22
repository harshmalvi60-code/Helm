# HELM

**The AI Growth Operator for D2C Brands.**

Single-page landing site. Zero dependencies. Deploys to Vercel in 90 seconds.

---

## Quick deploy (zero-config)

This repo is a pure static site. Vercel auto-detects and ships it. No build step.

### Step 1 — Push to GitHub

If you have `git` installed locally:

```bash
git init
git add .
git commit -m "Initial commit: HELM landing"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/helm-landing.git
git push -u origin main
```

**Or use GitHub's web UI (no terminal):**

1. Go to [github.com/new](https://github.com/new)
2. Name the repo `helm-landing`. Set it private or public — your call.
3. Don't initialize with a README (we have one).
4. Click **Create repository**.
5. On the next screen, click **"uploading an existing file"**.
6. Drag every file from this folder into the upload area:
   - `index.html`
   - `favicon.svg`
   - `vercel.json`
   - `robots.txt`
   - `.gitignore`
   - `README.md`
7. Commit changes.

### Step 2 — Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Sign in with GitHub if you haven't already.
3. Find `helm-landing` in your repo list and click **Import**.
4. **Framework Preset:** leave as "Other" (Vercel auto-detects static).
5. **Root Directory:** leave as `./`
6. **Build Command:** leave empty.
7. **Output Directory:** leave empty.
8. Click **Deploy**.

That's it. You'll have a live URL like `helm-landing-yourname.vercel.app` within 30 seconds.

### Step 3 — Connect your custom domain

Once HELM has a real domain (e.g. `usehelm.in`, `helm.ai`, etc.):

1. In your Vercel project, go to **Settings → Domains**.
2. Type your domain, click **Add**.
3. Vercel shows you the DNS records to add (an `A` record and/or a `CNAME`).
4. Add those records in your domain registrar's DNS panel (GoDaddy, Namecheap, BigRock, etc.).
5. Wait 5-30 minutes. SSL is auto-provisioned.

---

## Editing content

Everything lives in `index.html`. Open it in any code editor (VS Code, Sublime, even Notepad). Search-and-replace works fine.

| Section | What to change | Where |
|---|---|---|
| Brand name | `HELM` → your name | Find/replace `HELM` |
| Headline | `Your brand is leaking revenue.` | Search this string |
| Subhead | One paragraph below headline | Just below |
| Integrations | Shopify / Meta / Google etc. | Search `integration-row` |
| Monitoring vectors | 8 cards | Search `monitor-grid` |
| Recommendations feed | Sample insights | Search `feed-body` |
| Pricing | 3 tiers + amounts | Search `class="pricing"` |
| Email capture | CTA form action | Search `email-capture` |
| Footer | Year, brand | Search `Yuvaan Technologies` |

To change the accent color (neon green → anything else):
- Open `index.html`
- Find `--accent: #00FF88;` near the top
- Change it. Done. Every accent updates.

---

## File structure

```
helm-landing/
├── index.html       # Entire landing page
├── favicon.svg      # Browser tab icon
├── vercel.json      # Vercel config (clean URLs, security headers)
├── robots.txt       # SEO crawl rules
├── .gitignore       # What git should ignore
└── README.md        # This file
```

No build step. No node_modules. No framework. Just HTML + CSS + JS in one file. This is intentional — fast to ship, fast to load, easy to hand off.

---

## What's next

When HELM moves from landing page → real product, this scaffold graduates to Next.js. The landing page stays as-is at the root; the product moves to `/app`.

Roadmap:
- [ ] Wire email capture to Loops / Resend / ConvertKit (real waitlist backend)
- [ ] Add `/audit` route — interactive intake form
- [ ] Add `/manifesto` — long-form positioning page
- [ ] Add OG image (1200x630 social preview)
- [ ] Move to Next.js when product backend is ready

---

© 2026 Yuvaan Technologies · Built in India
