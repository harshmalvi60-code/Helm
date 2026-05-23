# HELM

**The AI Growth Operator for D2C Brands.**

A frontend-only MVP: real auth UI, onboarding, dashboard with charts, AI
insights feed, pricing — all driven by the Supabase JS SDK directly from
the browser. Zero serverless functions, ships clean on the **Vercel
Hobby plan**.

---

## Stack at a glance

- **Frontend:** Vanilla HTML + CSS + JS. No build step. Chart.js +
  Supabase JS loaded from CDN.
- **Auth + DB:** Supabase (browser SDK). Row-level security keeps each
  tenant's data isolated. Schema lives in `supabase/schema.sql`.
- **Insights:** Client-side templated generator that salts realistic
  insight cards with the user's actual snapshot numbers
  (`assets/js/insights-gen.js`). Trivially swappable for a real LLM
  call once you add a backend.
- **Integrations:** Connection flow is simulated client-side for the
  MVP. Real OAuth needs a server (a Supabase Edge Function or moving to
  Vercel Pro) since `client_secret` can't live in the browser.

## Folder map

```
.
├── index.html              # Marketing landing (orange-accent dark theme)
├── login.html / signup.html
├── onboarding.html         # Connect Shopify / Meta / GA / Klaviyo (simulated)
├── dashboard.html          # KPIs, ROAS, funnel, revenue/channel charts
├── insights.html           # AI insights feed + weekly report
├── settings.html           # Profile, integrations, alerts, subscription
├── pricing.html            # 3-tier pricing + FAQ
├── assets/
│   ├── css/app.css
│   └── js/{supabase,ui,app-shell,dashboard,insights-gen,integrations}.js
├── supabase/schema.sql     # DB schema + RLS policies (for when you go live)
├── vercel.json
└── package.json
```

---

## Quick start

### 1. Local preview
```bash
npx serve -l 3000 .
```
Open <http://localhost:3000>. With no Supabase config, HELM runs in
**demo mode** — auth + persistence are local-only via `localStorage`
and the dashboard renders synthesized but believable data so you can
walk through the full product immediately.

### 2. Wire up real Supabase (optional)
1. Create a project at <https://supabase.com>.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Authentication → Providers → enable Email + Google.
4. Add these two lines to the `<head>` of every HTML page (or to a
   tiny shared `assets/js/config.js` you load before `supabase.js`):

   ```html
   <script>
     window.HELM_CONFIG = {
       supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
       supabaseAnonKey: 'YOUR-ANON-KEY'
     };
   </script>
   ```

   The anon key is safe in the browser — RLS in the schema makes sure
   each user can only touch their own rows.

### 3. Deploy
```bash
npx vercel --prod
```
Or use Vercel's GitHub integration. The project is auto-detected as a
static site. No build command, no output dir, **no serverless
functions** → fits on the Hobby tier with room to spare.

---

## Roadmap

- [ ] Move insights generation behind a Supabase Edge Function so a
      real Claude/OpenAI key can power it
- [ ] Real OAuth flows (Shopify, Meta, GA4, Google Ads, Klaviyo) via
      Supabase Edge Functions
- [ ] Stripe billing for Starter / Growth plans (currently UI only)
- [ ] Multi-store workspaces for Scale plan

---

© 2026 Yuvaan Technologies · Built in India
