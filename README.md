# HELM

**The AI Growth Operator for D2C Brands.**

HELM connects to Shopify, Meta Ads, Google Analytics, Google Ads and Klaviyo,
detects where you're leaking revenue, and ships you a prioritized list of
fixes every week — powered by Claude.

---

## Stack at a glance

- **Frontend:** Vanilla HTML + CSS + JS (zero build step). Supabase JS
  client and Chart.js are loaded from CDN. Every page is hand-written for
  fast first paint and trivial debugging.
- **Auth:** Supabase Auth (email + Google OAuth).
- **Database:** Supabase Postgres with row-level security so each tenant
  only ever sees their own rows. Schema: `supabase/schema.sql`.
- **Server:** Vercel serverless Node.js 20 functions in `/api`. No npm deps.
- **AI:** Anthropic Messages API (Claude Sonnet 4.6) via direct HTTP.
- **Integrations:** Real OAuth flows for Shopify, Meta, Google (GA4 + Ads)
  and Klaviyo. State is HMAC-signed and stored in a short-lived cookie.

## Folder map

```
.
├── index.html              # Marketing landing (orange-accent dark theme)
├── login.html / signup.html
├── onboarding.html         # Connect Shopify / Meta / GA / Klaviyo
├── dashboard.html          # KPIs, ROAS, funnel, revenue/channel charts
├── insights.html           # AI insights feed + weekly report
├── settings.html           # Profile, integrations, alerts, subscription
├── pricing.html            # 3-tier pricing + FAQ
├── assets/
│   ├── css/app.css
│   └── js/{supabase,ui,app-shell,dashboard,insights,integrations}.js
├── api/
│   ├── config.js           # Public Supabase keys + capability flags
│   ├── ai/insights.js      # Claude → insights + weekly report
│   ├── data/snapshot.js    # Aggregated dashboard data
│   ├── data/sync.js        # Per-provider data sync
│   └── integrations/<p>/{install,callback}.js
├── lib/                    # Server helpers (Supabase REST, Claude, OAuth)
├── supabase/schema.sql     # DB schema + RLS policies
├── .env.example
├── vercel.json
└── package.json
```

---

## Quick start

### 1. Local dev
```bash
cp .env.example .env.local
npm i -g vercel
vercel dev
```
Open http://localhost:3000. With env vars blank, HELM falls into **demo
mode** — auth/persistence are local-only and the dashboard shows
synthesized data so you can navigate the whole product immediately.

### 2. Set up Supabase
1. Create a project at https://supabase.com.
2. SQL Editor → paste the contents of `supabase/schema.sql` → Run.
3. Authentication → Providers → enable Email + Google.
4. Drop the keys into `.env.local` (and into Vercel for prod):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 3. Enable AI
Add `ANTHROPIC_API_KEY`. Default model is `claude-sonnet-4-6` — override
with `ANTHROPIC_MODEL` if needed.

### 4. Wire up real integrations
For each provider you want live, set the matching env vars in
`.env.example`. Until you do, the **Connect** button on `/onboarding`
runs in demo mode (instantly marks the connection as live and lets you
continue).

Callback URLs to register in each provider's app settings:

| Provider     | Callback URL                                                |
|--------------|-------------------------------------------------------------|
| Shopify      | `https://your-domain/api/integrations/shopify/callback`     |
| Meta         | `https://your-domain/api/integrations/meta/callback`        |
| Google       | `https://your-domain/api/integrations/google/callback`      |
| Klaviyo      | `https://your-domain/api/integrations/klaviyo/callback`     |

### 5. Deploy
```bash
vercel --prod
```
Or use Vercel's GitHub integration — the project is auto-detected as a
static site with serverless functions. No build command, no output dir.

---

## Founder workflow

```
sign up  →  connect Shopify + Meta + GA  →  HELM syncs metrics
        →  Claude analyzes data         →  insights + weekly report
        →  dashboard updates            →  alerts on anomalies
```

Each connection writes a row to `public.integrations`. The
`/api/data/sync` endpoint fans out to each connected provider and writes
normalized daily aggregates into `public.analytics_daily`.
`/api/ai/insights` reads those aggregates and asks Claude to surface the
top revenue leaks, conversion drops, ROAS dips, creative-fatigue signals
and retention opportunities — then persists them to `public.insights`
and `public.reports`.

## Security notes

- All tables are RLS-protected — even with the anon key, a user can only
  read/write their own rows.
- Integration access/refresh tokens are stored in Postgres; consider
  enabling [Supabase Vault](https://supabase.com/docs/guides/database/vault)
  for envelope encryption before launching.
- OAuth state cookies are HMAC-signed with `HELM_OAUTH_SECRET` and
  expire after 10 minutes.
- The service-role key is only used server-side (never shipped to the
  browser).

## Roadmap

- [ ] Stripe billing for Starter / Growth plans (currently UI only)
- [ ] Cron-triggered weekly reports via Vercel cron + email
- [ ] Slack channel notifications
- [ ] Multi-store workspaces for Scale plan
- [ ] Encrypted token storage via Supabase Vault

---

© 2026 Yuvaan Technologies · Built in India
