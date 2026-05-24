# HELM

**The AI Growth Operator for D2C Brands.**

External multi-tenant SaaS dashboard. Each tenant signs up at our
domain, OAuths their Shopify store, and uses the live dashboard at
`helm.app/dashboard` — **not** embedded in the Shopify admin iframe.
Real Shopify orders, real analytics, zero mock data. 4 lightweight
Vercel serverless functions; everything else is static HTML/JS.
Fits on Vercel Hobby.

---

## Architecture

```
Browser (per-tenant)
   │
   │  Supabase Auth (email + Google OAuth, browser SDK + PKCE)
   ▼
HELM dashboard at helm.app
   │
   ├── /api/config                                  → public Supabase keys
   ├── /api/integrations/shopify/install            → 302 to Shopify OAuth
   │       │
   │       ▼
   │   shopify accounts.shopify.com authorize
   │       │
   │       ▼
   │   /api/integrations/shopify/callback           → HMAC + state verify
   │                                                  exchange code
   │                                                  store token server-side
   │                                                  per user_id (tenant)
   │
   └── /api/shopify/analytics                       → live Admin API fetch
                                                     scoped to caller's tenant
```

**Multi-tenant**: every row in `integrations`, `insights`, `reports`,
`notifications` carries `user_id` and is gated by Supabase RLS. Each
tenant's Shopify token is stored in their own row; the analytics
endpoint reads the caller's row via service-role + their JWT, never
sees other tenants' data.

**Not embedded**: HELM is a standalone external app. We do NOT load
inside the Shopify admin iframe — no App Bridge, no iframe escape
gymnastics, no session-token auth. The Shopify Partner app is
configured with **embedded = false**.

## Folder map

```
.
├── index.html                                # Landing (with App Store install hook)
├── login.html / signup.html
├── onboarding.html                           # 4-step wizard
├── dashboard.html                            # Real Shopify data only
├── insights.html / reports.html
├── profile.html / settings.html / pricing.html
├── setup-required.html                       # Shown when env missing
├── assets/
│   ├── css/app.css
│   └── js/{supabase, ui, app-shell, dashboard, insights-gen,
│            integrations, notifications, ai-loader}.js
├── api/
│   ├── config.js                             # public config delivery
│   ├── integrations/shopify/install.js       # OAuth start (302)
│   ├── integrations/shopify/callback.js      # token exchange + store
│   └── shopify/analytics.js                  # live Admin API → snapshot
├── lib/
│   ├── supabase.js                           # REST + service-role helpers
│   ├── oauth.js                              # HMAC state cookies
│   └── shopify.js                            # Admin API client + HMAC verify
├── scripts/setup-supabase.js                 # one-command schema apply
├── supabase/schema.sql                       # tables, RLS, token revoke
├── vercel.json / package.json / .env.example
```

## Setup

### 1. Supabase project
1. Create a project at <https://supabase.com>.
2. Copy from `Settings → API`: URL, anon key, service-role key.
3. Get a personal access token at
   <https://supabase.com/dashboard/account/tokens> → `SUPABASE_ACCESS_TOKEN`
4. Copy the project ref (the subdomain) → `SUPABASE_PROJECT_REF`

### 2. Apply the schema
```bash
cp .env.example .env.local       # paste the values from step 1
npm run setup
```
Applies `supabase/schema.sql` via the Supabase Management API. Creates
all tables, enables RLS, and revokes anon/authenticated SELECT on the
`access_token` column. Idempotent.

### 3. Shopify Partner app
1. <https://partners.shopify.com> → Apps → Create app (Custom or Public).
2. **App URL**: `https://your-domain/` (landing — the install hook
   detects `?shop=` and bounces to OAuth)
3. **Allowed redirection URL**:
   `https://your-domain/api/integrations/shopify/callback`
4. **Embedded app: OFF** (this is a standalone external SaaS, not
   an embedded admin app)
5. Copy client ID + secret → `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.

### 4. OAuth state secret
```bash
openssl rand -hex 32     # → HELM_OAUTH_SECRET
```

### 5. Deploy
Set all env vars (see `.env.example`) in
**Vercel → Project Settings → Environment Variables**, then:
```bash
npx vercel --prod
```

No HTML edits required — `/api/config` delivers the public keys to the
browser on every page load.

---

## Tenant flow

```
visit /signup
    → Supabase signup (email + password or Google OAuth)
visit /onboarding
    → wizard step 3: "Connect Shopify"
    → modal asks for your shop URL (acme.myshopify.com)
    → 302 to /api/integrations/shopify/install?shop=acme.myshopify.com
    → 302 to https://acme.myshopify.com/admin/oauth/authorize?...
    → merchant approves → 302 back to /api/integrations/shopify/callback
    → HMAC verified, code → access_token, stored scoped to user_id
    → "Shopify connected · 1,284 orders detected" notification fires
    → redirect to /onboarding?connected=shopify
    → wizard step 4: AI analysis runs against /api/shopify/analytics
    → redirect to /dashboard?onboarded=1
visit /dashboard
    → /api/shopify/analytics fetches live orders + products
    → real KPIs, daily revenue series, top products, funnel
```

Alternate entry (App Store install):
- Shopify directs merchant to `https://your-domain/?shop=…`
- Landing page's inline script detects `?shop=` → bounces to install

## Token lifecycle

- Shopify offline tokens don't expire by default → no refresh logic.
- If a tenant uninstalls the app or revokes the grant, the next
  `/api/shopify/analytics` call gets a 401 from Shopify, sets the
  integration row's status to `revoked`, fires a critical notification,
  and the dashboard shows a "Reconnect Shopify" CTA instead of stale data.

## Multi-tenant security

- ✅ Tokens stored in `integrations.access_token`, column-level SELECT
  REVOKEd from anon + authenticated — only the service role (server)
  can read them
- ✅ Every analytics call resolves the caller's tenant from their
  Supabase JWT, then reads only that tenant's integration row
- ✅ All tables RLS-protected by `auth.uid()`
- ✅ OAuth state HMAC-signed, 10-min expiry, HttpOnly Secure Lax cookie
- ✅ Shopify HMAC validated on every callback
- ✅ Iframe embedding blocked (`X-Frame-Options: SAMEORIGIN` + CSP
  `frame-ancestors 'self'`) — clickjacking-safe
- ✅ Service-role key only used in `/api/*` routes, never sent to browser

## Status of each integration

| Provider     | OAuth | Live data | Notes |
|--------------|-------|-----------|-------|
| Shopify      | ✅    | ✅        | Orders, products, customers, funnel |
| Meta Ads     | —     | —         | Coming soon (UI only) |
| Google GA4   | —     | —         | Coming soon (UI only) |
| Google Ads   | —     | —         | Coming soon (UI only) |
| Klaviyo      | —     | —         | Coming soon (UI only) |

Each new provider adds 2 functions (install + callback) plus an
analytics route — still well within Vercel Hobby's 12-function cap.

---

© 2026 Yuvaan Technologies · Built in India
