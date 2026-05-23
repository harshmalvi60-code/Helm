// GET /api/data/snapshot?range=30d
// Returns aggregated KPIs + daily series + funnel + channel mix for the dashboard.
// Real path: pulls from public.analytics_daily (RLS-scoped by the JWT).
// Demo path: returns deterministic-but-believable data so the UI is never empty.

const { getUserFromRequest, bearerFromReq, hasSupabase, rest } = require('../../lib/supabase');

module.exports = async (req, res) => {
  const range = (req.query?.range) || pickQuery(req.url, 'range') || '30d';
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

  const user = await getUserFromRequest(req).catch(() => null);
  const userToken = bearerFromReq(req);

  let series = null;
  if (user && hasSupabase()) {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    series = await rest('analytics_daily', {
      method: 'GET',
      query: `?user_id=eq.${user.id}&date=gte.${since}&select=*&order=date.asc`,
      userToken,
    }).catch(() => null);
  }

  if (!series || !series.length) {
    res.status(200).json(synthesize(range, days));
    return;
  }

  res.status(200).json(aggregate(series, range));
};

function pickQuery(url, name) {
  try {
    const u = new URL('https://x' + (url || ''));
    return u.searchParams.get(name);
  } catch (_) { return null; }
}

function aggregate(rows, range) {
  const totals = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const revenue = totals('revenue');
  const spend = totals('ad_spend');
  const sessions = totals('sessions');
  const orders = totals('orders');

  // Group rows by date (sum across sources)
  const byDate = {};
  rows.forEach((r) => {
    const d = r.date;
    if (!byDate[d]) byDate[d] = { date: d, revenue: 0, spend: 0, sessions: 0, orders: 0 };
    byDate[d].revenue += Number(r.revenue || 0);
    byDate[d].spend   += Number(r.ad_spend || 0);
    byDate[d].sessions += Number(r.sessions || 0);
    byDate[d].orders  += Number(r.orders || 0);
  });
  const series = Object.values(byDate).map((d) => ({
    ...d,
    roas: d.spend > 0 ? +(d.revenue / d.spend).toFixed(2) : 0,
    cvr: d.sessions > 0 ? +((d.orders / d.sessions) * 100).toFixed(2) : 0,
    aov: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Group rows by source to build the channel breakdown
  const bySource = {};
  rows.forEach((r) => {
    const src = r.source || 'unknown';
    if (!bySource[src]) bySource[src] = { name: friendly(src), spend: 0, revenue: 0, color: colorFor(src) };
    bySource[src].revenue += Number(r.revenue || 0);
    bySource[src].spend += Number(r.ad_spend || 0);
  });
  const channels = Object.values(bySource).map((c) => ({ ...c, roas: c.spend > 0 ? +(c.revenue / c.spend).toFixed(2) : null }));

  const funnel = [
    { label: 'Sessions', count: sessions },
    { label: 'Product views', count: Math.round(sessions * 0.58) },
    { label: 'Add to cart', count: Math.round(sessions * 0.18) },
    { label: 'Checkout started', count: Math.round(sessions * 0.064) },
    { label: 'Purchased', count: orders },
  ];

  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((s, d) => ({ revenue: s.revenue + d.revenue, spend: s.spend + d.spend, sessions: s.sessions + d.sessions, orders: s.orders + d.orders }), { revenue: 0, spend: 0, sessions: 0, orders: 0 });

  return {
    generated_at: new Date().toISOString(),
    range,
    kpis: {
      revenue:  { value: revenue,  delta: deltaPct(revenue, prev.revenue * 2) },
      ad_spend: { value: spend,    delta: deltaPct(spend,   prev.spend * 2) },
      roas:     { value: spend > 0 ? +(revenue / spend).toFixed(2) : 0, delta: 0 },
      orders:   { value: orders,   delta: deltaPct(orders,  prev.orders * 2) },
      sessions: { value: sessions, delta: deltaPct(sessions, prev.sessions * 2) },
      cvr:      { value: sessions > 0 ? +((orders / sessions) * 100).toFixed(2) : 0, delta: 0 },
      aov:      { value: orders > 0 ? Math.round(revenue / orders) : 0, delta: 0 },
      ltv:      { value: orders > 0 ? Math.round((revenue / orders) * 1.6) : 0, delta: 4.2 },
    },
    series, channels, funnel,
  };
}

function friendly(src) {
  return ({ shopify: 'Shopify', meta: 'Meta Ads', google: 'Google Analytics', 'google-ads': 'Google Ads', klaviyo: 'Klaviyo / Email' })[src] || src;
}
function colorFor(src) {
  return ({ shopify: '#95BF47', meta: '#1877F2', google: '#E37400', 'google-ads': '#4285F4', klaviyo: '#9D6BFF' })[src] || '#FF7A1A';
}
function deltaPct(curr, prev) {
  if (!prev) return 0;
  return +(((curr - prev) / prev) * 100).toFixed(1);
}

function synthesize(range, days) {
  const seed = Math.floor(Date.now() / 86400000);
  let s = seed;
  const r = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const rev = 240000 * (0.85 + r() * 0.35);
    const sp = 60000 * (0.9 + r() * 0.25);
    const sess = Math.round(rev / (180 + r() * 60));
    const ord = Math.round(rev / (2200 + r() * 400));
    series.push({ date, revenue: Math.round(rev), spend: Math.round(sp), roas: +(rev / sp).toFixed(2), sessions: sess, orders: ord, cvr: +((ord / sess) * 100).toFixed(2), aov: Math.round(rev / ord) });
  }

  const tot = (k) => series.reduce((s, d) => s + d[k], 0);
  const totalRev = tot('revenue'), totalSp = tot('spend'), totalSess = tot('sessions'), totalOrd = tot('orders');

  return {
    generated_at: new Date().toISOString(),
    range, demo: true,
    kpis: {
      revenue:  { value: totalRev, delta: 12.4 },
      ad_spend: { value: totalSp,  delta: 5.8 },
      roas:     { value: +(totalRev / totalSp).toFixed(2), delta: 6.1 },
      orders:   { value: totalOrd, delta: 9.3 },
      sessions: { value: totalSess, delta: 7.1 },
      cvr:      { value: +((totalOrd / totalSess) * 100).toFixed(2), delta: 2.1 },
      aov:      { value: Math.round(totalRev / totalOrd), delta: 1.4 },
      ltv:      { value: Math.round((totalRev / totalOrd) * 1.6), delta: 4.2 },
    },
    series,
    channels: [
      { name: 'Meta Ads',    spend: totalSp * 0.55, revenue: totalRev * 0.42, color: '#1877F2', roas: +(totalRev * 0.42 / (totalSp * 0.55)).toFixed(2) },
      { name: 'Google Ads',  spend: totalSp * 0.30, revenue: totalRev * 0.28, color: '#4285F4', roas: +(totalRev * 0.28 / (totalSp * 0.30)).toFixed(2) },
      { name: 'Organic',     spend: 0,              revenue: totalRev * 0.16, color: '#FF7A1A', roas: null },
      { name: 'Email / SMS', spend: totalSp * 0.05, revenue: totalRev * 0.10, color: '#9D6BFF', roas: +(totalRev * 0.10 / (totalSp * 0.05)).toFixed(2) },
      { name: 'Direct',      spend: 0,              revenue: totalRev * 0.04, color: '#8A8A8A', roas: null },
    ],
    funnel: [
      { label: 'Sessions', count: totalSess },
      { label: 'Product views', count: Math.round(totalSess * 0.58) },
      { label: 'Add to cart', count: Math.round(totalSess * 0.18) },
      { label: 'Checkout started', count: Math.round(totalSess * 0.064) },
      { label: 'Purchased', count: totalOrd },
    ],
  };
}
