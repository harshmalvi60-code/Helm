# HELM

**The AI Growth Operator for D2C Brands.**

Real Shopify OAuth, real orders, real analytics — zero mock data anywhere
on the dashboard. 4 lightweight Vercel serverless functions handle OAuth,
analytics aggregation and runtime config; everything else is static
HTML/JS. Fits on Vercel Hobby.

---

## Architecture

```
Browser  ──► /api/config                          (public Supabase keys)
        │
        ├─► /api/integrations/shopify/install     (start OAuth)
        │       │
        │       ▼
        │   Shopify authorize → /api/integrations/shopify/callback
        │       │                  (HMAC + state verify)
        │       │                  (exchange code → access_token)
        │       │                  (store token server-side only)
        │       │                  (insert "connected" notification)
        │       ▼
        │   Supabase: integrations.access_token  ← REVOKE'd from anon/auth
        │
        └─► /api/shopify/analytics                (live Admin API fetch)
                │                                   → aggregated KPIs
                │                                   → if 401 → mark revoked
                ▼
            Dashboard renders real data only
```

- **Auth**: Supabase (email + Google OAuth, browser SDK + PKCE flow).
- **Tokens**: stored in `integrations.access_token`. Column-level SELECT
  is REVOKEd from anon + authenticated roles, so tokens never leave the
  server. Service role key is server-only.
- **No mock fallback**: if env isn't set, the user lands on
  `/setup-required` with a clear missing-vars checklist.
- **Notifications**: real events only — `shopify_connected`,
  `shopify_revoked`, AI insight runs.

## Folder map

```
.
├── index.html                                # Landing
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
│   ├── integrations/shopify/install.js       # OAuth start
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

## Setup (10 minutes, one command)

### 1. Supabase project
1. Create a project at <https://supabase.com>.
2. Copy from `Settings → API`:
   - Project URL → `SUPABASE_URL`
   - `anon` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
3. Get a personal access token at
   <https://supabase.com/dashboard/account/tokens> → `SUPABASE_ACCESS_TOKEN`
4. Copy the project ref (the subdomain) → `SUPABASE_PROJECT_REF`

### 2. Apply the schema
```bash
cp .env.example .env.local       # paste the values from step 1
npm run setup
```
This script applies `supabase/schema.sql` via the Supabase Management
API: creates all tables, enables RLS, and revokes anon/authenticated
SELECT on the `access_token` column. Idempotent — re-run any time the
schema changes.

### 3. Shopify Partner app
1. <https://partners.shopify.com> → Apps → Create app (Custom or Public).
2. **App URL**: `https://your-domain/onboarding`
3. **Allowed redirection URL**:
   `https://your-domain/api/integrations/shopify/callback`
4. Copy client ID + secret → `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.

### 4. OAuth state secret
```bash
openssl rand -hex 32     # → HELM_OAUTH_SECRET
```

### 5. Deploy
Set all the env vars (see `.env.example`) in
**Vercel → Project Settings → Environment Variables**, then:
```bash
npx vercel --prod
```

No HTML edits required — `/api/config` delivers the public keys to the
browser on every page load.

---

## Founder flow

```
visit /signup
    → real Supabase signup (email + password or Google OAuth)
visit /onboarding
    → wizard step 3: "Connect Shopify"
    → modal asks for your shop URL (acme.myshopify.com)
    → 302 to /api/integrations/shopify/install?shop=acme.myshopify.com
    → 302 to https://acme.myshopify.com/admin/oauth/authorize?...
    → user approves → 302 back to /api/integrations/shopify/callback
    → HMAC verified, code → access_token, stored via service role
    → "Shopify connected · 1,284 orders detected" notification fires
    → redirect to /onboarding?connected=shopify
    → wizard step 4: AI analysis runs against /api/shopify/analytics
    → redirect to /dashboard?onboarded=1
visit /dashboard
    → /api/shopify/analytics fetches live orders + products
    → real KPIs, daily revenue series, top products, funnel
```

## Token lifecycle

- Shopify offline tokens don't expire by default → no refresh logic.
- If a user uninstalls the app or revokes the grant, the next
  `/api/shopify/analytics` call gets a 401 from Shopify, sets the
  integration row's status to `revoked`, fires a critical notification,
  and the dashboard shows a "Reconnect Shopify" CTA instead of stale data.

## Status of each integration

| Provider     | OAuth | Live data | Notes |
|--------------|-------|-----------|-------|
| Shopify      | ✅    | ✅        | Orders, products, customers, funnel |
| Meta Ads     | —     | —         | Coming soon (UI only) |
| Google GA4   | —     | —         | Coming soon (UI only) |
| Google Ads   | —     | —         | Coming soon (UI only) |
| Klaviyo      | —     | —         | Coming soon (UI only) |

Each new provider adds 2 functions (install + callback) plus optionally
an analytics route — still well within Vercel Hobby's 12-function cap.

## Security checklist

- ✅ Access tokens never leave the server (column-level REVOKE)
- ✅ Service-role key only used in `/api/*` routes
- ✅ OAuth state HMAC-signed, 10-min expiry, HttpOnly secure cookie
- ✅ Shopify HMAC validated on every callback
- ✅ All Supabase tables RLS-protected by `auth.uid()`
- ✅ Tokens encrypted at rest (Supabase default) — Vault recommended for production
- ✅ No mock data path — misconfigured deploys land on `/setup-required`

---

© 2026 Yuvaan Technologies · Built in India
