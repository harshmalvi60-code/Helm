// GET /api/shopify/analytics?range=7d|30d|90d
// Returns aggregated KPIs + daily series + top products + funnel data
// from the connected Shopify store. Access token is read server-side only.

const { getUserFromRequest, getIntegration, upsertIntegration, hasSupabase, rest } = require('../../lib/supabase');
const { listOrders, listProducts, getShopInfo } = require('../../lib/shopify');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=60');

  try {
    if (!hasSupabase()) {
      return json(res, 200, { connected: false, reason: 'supabase_not_configured' });
    }

    const user = await getUserFromRequest(req).catch(() => null);
    if (!user) return json(res, 401, { error: 'Sign in first' });

    const integ = await getIntegration(user.id, 'shopify');
    if (!integ || integ.status !== 'connected' || !integ.access_token || !integ.account_id) {
      return json(res, 200, { connected: false, reason: 'shopify_not_connected' });
    }

    const shop = integ.account_id;
    const accessToken = integ.access_token;
    const range = pickRange(req);
    const days = RANGE_DAYS[range] || 30;
    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
    const priorSinceIso = new Date(Date.now() - days * 2 * 86400000).toISOString();

    // Parallel fetch: orders (current + prior period), products, shop info
    let allOrders, products, shopInfo;
    try {
      [allOrders, products, shopInfo] = await Promise.all([
        listOrders(shop, accessToken, { sinceIso: priorSinceIso, limit: 250 }),
        listProducts(shop, accessToken, { limit: 50 }).catch(() => []),
        getShopInfo(shop, accessToken).catch(() => null),
      ]);
    } catch (e) {
      // If Shopify rejects the token (401/403), the user uninstalled the
      // app or revoked access. Mark the integration row so the UI can
      // prompt them to reconnect — and never return mock data.
      const msg = String(e.message || '');
      if (/\b(401|403)\b/.test(msg)) {
        try {
          await upsertIntegration(user.id, 'shopify', { status: 'revoked' });
          await rest('notifications', {
            method: 'POST',
            body: {
              user_id: user.id, severity: 'critical', kind: 'shopify_revoked',
              title: 'Shopify access revoked',
              body:  'HELM lost access to your store. Reconnect to keep your dashboard live.',
              read: false,
            },
          }).catch(() => {});
        } catch (_) {}
        return json(res, 200, { connected: false, reason: 'shopify_revoked', shop });
      }
      throw e;
    }

    const currency = (shopInfo && shopInfo.currency) || (integ.metadata && integ.metadata.currency) || 'INR';

    const sinceMs = Date.parse(sinceIso);
    const currentOrders = allOrders.filter((o) => Date.parse(o.created_at) >= sinceMs);
    const priorOrders   = allOrders.filter((o) => Date.parse(o.created_at) < sinceMs);

    const snapshot = buildSnapshot({
      currentOrders,
      priorOrders,
      products,
      range,
      days,
      currency,
      shop,
      shopName: (shopInfo && shopInfo.name) || integ.account_label || shop,
      shopInfo,
    });

    // Stamp last_synced_at on the integration row (best-effort)
    upsertIntegration(user.id, 'shopify', { last_synced_at: new Date().toISOString() }).catch(() => {});

    json(res, 200, snapshot);
  } catch (e) {
    console.error('shopify/analytics error', e);
    json(res, 500, { error: e.message || 'Shopify analytics failed', connected: true });
  }
};

function pickRange(req) {
  try {
    const u = new URL(req.url, 'https://x');
    const r = u.searchParams.get('range');
    return RANGE_DAYS[r] ? r : '30d';
  } catch (_) { return '30d'; }
}

function buildSnapshot({ currentOrders, priorOrders, products, range, days, currency, shop, shopName, shopInfo }) {
  // Daily series of revenue + order count
  const seriesMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    seriesMap[date] = { date, revenue: 0, spend: 0, orders: 0, sessions: 0 };
  }
  for (const o of currentOrders) {
    const d = (o.created_at || '').slice(0, 10);
    if (!seriesMap[d]) continue;
    const rev = parseFloat(o.total_price || '0') || 0;
    seriesMap[d].revenue += rev;
    seriesMap[d].orders  += 1;
  }
  const series = Object.values(seriesMap).map((row) => ({
    ...row,
    revenue: Math.round(row.revenue),
    aov: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
    roas: 0,
    cvr: 0,
  }));

  const totalRev = round(sum(currentOrders, (o) => parseFloat(o.total_price || '0')));
  const totalOrd = currentOrders.length;
  const priorRev = round(sum(priorOrders, (o) => parseFloat(o.total_price || '0')));
  const priorOrd = priorOrders.length;

  // Sessions / CVR aren't in the orders endpoint — leave as null until
  // a GA4 / Shopify Plus analytics connection lands. The UI handles nulls.
  const sessions = null;
  const cvr = null;

  // Unique customers across the window
  const customerIds = new Set(currentOrders.map((o) => o.customer && o.customer.id).filter(Boolean));
  const priorCustomerIds = new Set(priorOrders.map((o) => o.customer && o.customer.id).filter(Boolean));

  // Top products by line-item revenue (proxy — Shopify needs separate
  // /reports endpoint for true product-level totals on Plus plans)
  const productAggregate = {};
  for (const o of currentOrders) {
    for (const li of (o.line_items || [])) {
      const key = String(li.product_id || li.title);
      const item = productAggregate[key] || { name: li.title || 'Untitled', sku: li.sku || null, orders: 0, revenue: 0, product_id: li.product_id };
      const lineRev = parseFloat(li.price || '0') * (li.quantity || 1);
      item.orders   += li.quantity || 1;
      item.revenue  += lineRev;
      productAggregate[key] = item;
    }
  }
  const productById = Object.fromEntries(products.map((p) => [String(p.id), p]));
  const topProducts = Object.values(productAggregate)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((p) => {
      const product = productById[String(p.product_id)] || null;
      const stock = product
        ? (product.variants || []).reduce((s, v) => s + (Number(v.inventory_quantity) || 0), 0)
        : null;
      return {
        name: p.name,
        sku: p.sku || (product && product.variants && product.variants[0] && product.variants[0].sku) || '—',
        orders: p.orders,
        revenue: Math.round(p.revenue),
        stock,
      };
    });

  // Single channel until other integrations land — "Shopify (direct)"
  const channels = [
    { name: 'Shopify (direct)', revenue: totalRev, spend: 0, roas: null, color: '#95BF47' },
  ];

  // Funnel: with orders endpoint only, we can show two real steps
  // (orders, fulfilled) and leave the rest null until GA4/Plus analytics
  // is connected. Frontend treats nulls as "—".
  const fulfilled = currentOrders.filter((o) => o.fulfillment_status === 'fulfilled').length;
  const funnel = [
    { label: 'Orders',          count: totalOrd },
    { label: 'Paid',            count: currentOrders.filter((o) => o.financial_status === 'paid').length },
    { label: 'Fulfilled',       count: fulfilled },
  ];

  return {
    connected: true,
    shop, shopName,
    currency,
    range,
    generated_at: new Date().toISOString(),
    kpis: {
      revenue:  { value: totalRev,                                   delta: deltaPct(totalRev, priorRev) },
      ad_spend: { value: 0,                                          delta: 0, missing: true },
      roas:     { value: null,                                       delta: 0, missing: true },
      orders:   { value: totalOrd,                                   delta: deltaPct(totalOrd, priorOrd) },
      sessions: { value: sessions,                                   delta: 0, missing: true },
      cvr:      { value: cvr,                                        delta: 0, missing: true },
      aov:      { value: totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0,
                  delta: deltaPct(totalOrd > 0 ? totalRev / totalOrd : 0, priorOrd > 0 ? priorRev / priorOrd : 0) },
      ltv:      { value: customerIds.size > 0 ? Math.round(totalRev / customerIds.size) : 0,
                  delta: deltaPct(customerIds.size > 0 ? totalRev / customerIds.size : 0,
                                  priorCustomerIds.size > 0 ? priorRev / priorCustomerIds.size : 0) },
    },
    series, channels, funnel,
    products: topProducts,
    customers: { count_in_range: customerIds.size, prior: priorCustomerIds.size },
  };
}

function sum(arr, fn) { return arr.reduce((s, x) => s + (fn(x) || 0), 0); }
function round(n) { return Math.round(n); }
function deltaPct(curr, prev) {
  if (!prev || isNaN(prev)) return 0;
  return +(((curr - prev) / prev) * 100).toFixed(1);
}

function json(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
