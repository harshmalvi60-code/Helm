# HELM

**The AI Growth Operator for D2C Brands.**

Real Shopify OAuth, real orders, real analytics, real insights — no
mock data anywhere on the dashboard. 3 lightweight Vercel serverless
functions handle the OAuth and analytics aggregation; everything else
is static HTML/JS. Fits on Vercel Hobby.

---

## Architecture

```
Browser (static HTML/JS + Supabase JS)
    │
    ├── Auth                 → Supabase Auth (browser SDK)
    ├── Integrations list    → Supabase REST (RLS-protected, no tokens visible)
    ├── /api/integrations/shopify/install     ──► Shopify OAuth authorize URL
    ├── /api/integrations/shopify/callback   ──► Token exchange + secure store
    └── /api/shopify/analytics                ──► Live Shopify Admin API call,
                                                  aggregates KPIs + series +
                                                  top products + funnel
```

- **Auth**: Supabase (email + Google OAuth, browser-side SDK).
- **DB**: Supabase Postgres. Tokens stored in `integrations.access_token`
  with column-level SELECT revoked from anon + authenticated roles, so
  the access token never reaches the browser.
- **Shopify**: real OAuth (`/api/integrations/shopify/install` +
  `/callback`) with HMAC-signed state cookie + Shopify HMAC validation.
- **Analytics**: server-side fetch against the Shopify Admin REST API.
  Returns aggregated KPIs, daily revenue series, top products, funnel.
- **Insights generator**: client-side templates that only fire when the
  data they need is present (e.g. ROAS templates skip until Meta is
  connected). Every number references a real value the user can see.
- **Other integrations** (Meta, GA, Google Ads, Klaviyo): UI present
  with "Coming soon" badges — slot in additional OAuth pairs when ready.

## Folder map

```
.
├── index.html              # Landing
├── login.html / signup.html
├── onboarding.html         # 4-step wizard
├── dashboard.html          # Real Shopify data only
├── insights.html           # AI insights feed + weekly report
├── reports.html
├── profile.html / settings.html
├── pricing.html
├── assets/
│   ├── css/app.css
│   └── js/{supabase, ui, app-shell, dashboard, insights-gen,
│            integrations, notifications, ai-loader}.js
├── api/
│   ├── integrations/shopify/install.js
│   ├── integrations/shopify/callback.js
│   └── shopify/analytics.js
├── lib/
│   ├── supabase.js     # REST helpers (service-role)
│   ├── oauth.js        # HMAC-signed state cookie
│   └── shopify.js      # Admin API client + HMAC verify
└── supabase/schema.sql # tables, RLS, column-level token revoke
```

## Setup (15 minutes)

### 1. Supabase
1. Create a project at <https://supabase.com>.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Auth → Providers → enable Email (+ Google if desired).
4. Copy the URL, anon key, and service role key.

### 2. Shopify Partner app
1. <https://partners.shopify.com/> → Apps → Create app → Public.
2. App URL: `https://your-domain/onboarding`
3. Allowed redirection URL: `https://your-domain/api/integrations/shopify/callback`
4. Copy client ID + secret.

### 3. Environment
Copy `.env.example` → `.env.local` and fill in:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `HELM_OAUTH_SECRET` (run `openssl rand -hex 32`)
- `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`

In production, set the same variables in Vercel → Project Settings →
Environment Variables.

### 4. Expose Supabase keys to the browser
Add this snippet to the `<head>` of every page (or to a tiny shared
`assets/js/config.js` you `<script>` before `supabase.js`):

```html
<script>
  window.HELM_CONFIG = {
    supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
    supabaseAnonKey: 'YOUR-ANON-KEY'
  };
</script>
```

The anon key is safe in the browser — RLS gates every row by `auth.uid()`,
and the `access_token` column is REVOKEd from anon/authenticated.

### 5. Run / deploy
```bash
npx vercel dev      # local
npx vercel --prod   # production
```

---

## Founder flow

```
sign up → onboarding wizard (brand, goal, connect Shopify)
        → real OAuth round-trip with Shopify
        → /api/shopify/analytics fetches orders + products
        → dashboard renders live KPIs, charts, funnel, products
        → AI insights generated from the live snapshot
```

## What's deferred

- Meta Ads, Google Ads, GA4, Klaviyo OAuth — UI present, marked
  "Coming soon". Each adds 2 backend functions; still well under
  Vercel Hobby's 12-function ceiling.
- Real LLM-generated insights via Claude/OpenAI — currently uses
  templated narratives parameterized by live numbers. Wire a single
  `/api/ai/insights` route to swap in real generation.
- Stripe billing — pricing page UI is present, no charging logic yet.

---

© 2026 Yuvaan Technologies · Built in India
