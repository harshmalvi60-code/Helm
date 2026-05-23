// POST /api/data/sync
// Body: { provider?: 'shopify'|'meta'|'google'|'google-ads'|'klaviyo' }
// Fans out per-provider fetchers and writes normalized daily aggregates
// into analytics_daily. Each fetcher is intentionally a thin scaffold that
// you fill in with the live API call once OAuth is connected.

const { getUserFromRequest, bearerFromReq, hasSupabase, rest, getIntegrations } = require('../../lib/supabase');
const { readJsonBody } = require('../../lib/oauth');

const SUPPORTED = ['shopify', 'meta', 'google', 'google-ads', 'klaviyo'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const user = await getUserFromRequest(req).catch(() => null);
  const userToken = bearerFromReq(req);
  const body = await readJsonBody(req);

  if (!user) {
    // Demo mode — pretend the sync queued.
    res.status(200).json({ ok: true, demo: true, message: 'Sync queued (demo)' });
    return;
  }

  const providers = body.provider ? [body.provider] : SUPPORTED;
  const integ = (await getIntegrations(user.id, userToken)) || [];
  const connectedSet = new Set(integ.filter((r) => r.status === 'connected').map((r) => r.provider));

  const results = await Promise.all(providers.map(async (p) => {
    if (!connectedSet.has(p)) return { provider: p, skipped: 'not_connected' };
    try {
      const rows = await FETCHERS[p](integ.find((r) => r.provider === p));
      if (rows.length) await writeDaily(user.id, p, rows, userToken);
      return { provider: p, ingested: rows.length };
    } catch (e) {
      return { provider: p, error: e.message };
    }
  }));

  res.status(200).json({ ok: true, results });
};

async function writeDaily(userId, source, rows, userToken) {
  if (!hasSupabase()) return;
  const body = rows.map((r) => ({ ...r, user_id: userId, source }));
  await rest('analytics_daily', {
    method: 'POST',
    query: '?on_conflict=user_id,source,date',
    prefer: 'resolution=merge-duplicates',
    body,
    userToken,
  });
}

// ============ PROVIDER FETCHERS ============
// Each one returns an array of { date, revenue, ad_spend, sessions, orders, ... }.
// Fill in the real call once you've OAuth-connected and stored a token.

const FETCHERS = {
  shopify: async (integ) => {
    // Real shape:
    //   GET https://{shop}.myshopify.com/admin/api/2024-07/orders.json
    //     ?status=any&created_at_min=YYYY-MM-DD
    //   Authorization: Bearer <integ.access_token>
    //
    //   Then bucket orders by created_at::date.
    if (!integ?.access_token || !integ?.account_id) return sampleDaily(30, { revenue: 240000, orders: 100, sessions: 1200 });
    return sampleDaily(30, { revenue: 240000, orders: 100, sessions: 1200 });
  },

  meta: async (integ) => {
    // Real shape:
    //   GET https://graph.facebook.com/v19.0/act_{adAccountId}/insights
    //     ?fields=spend,actions,impressions,clicks,frequency
    //     &time_range={'since':'YYYY-MM-DD','until':'YYYY-MM-DD'}
    //     &time_increment=1
    //     &access_token={integ.access_token}
    return sampleDaily(30, { ad_spend: 32000, sessions: 0, revenue: 95000 });
  },

  google: async (integ) => {
    // Real shape: GA4 Data API
    //   POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
    //     body: { dateRanges, dimensions:[{name:'date'}], metrics:[{name:'sessions'},{name:'conversions'},{name:'totalRevenue'}] }
    return sampleDaily(30, { sessions: 1400, revenue: 0 });
  },

  'google-ads': async (integ) => {
    // Real shape: Google Ads API
    //   POST https://googleads.googleapis.com/v17/customers/{customer_id}/googleAds:searchStream
    //     GAQL: SELECT segments.date, metrics.cost_micros, metrics.conversions_value FROM customer ...
    return sampleDaily(30, { ad_spend: 14000, revenue: 56000 });
  },

  klaviyo: async (integ) => {
    // Real shape:
    //   GET https://a.klaviyo.com/api/metric-aggregates/
    //     Revision: 2024-07-15
    //     Authorization: Klaviyo-API-Key {integ.access_token}
    return sampleDaily(30, { revenue: 32000 });
  },
};

function sampleDaily(days, base) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const noise = 0.85 + Math.random() * 0.35;
    out.push({
      date,
      revenue:  Math.round((base.revenue  || 0) * noise),
      ad_spend: Math.round((base.ad_spend || 0) * noise),
      sessions: Math.round((base.sessions || 0) * noise),
      orders:   Math.round((base.orders   || 0) * noise),
    });
  }
  return out;
}
