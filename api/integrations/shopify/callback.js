// GET /api/integrations/shopify/callback?code=&shop=&state=&hmac=&timestamp=
// Validates HMAC + state, exchanges code → access_token, stores it securely.

const { verify, readCookie, clearStateCookie, originFrom } = require('../../../lib/oauth');
const { upsertIntegration, logEvent, rest } = require('../../../lib/supabase');
const { verifyHmac, exchangeCode, getShopInfo, countOrders, hasShopify, SCOPES } = require('../../../lib/shopify');

module.exports = async (req, res) => {
  try {
    if (!hasShopify()) throw new Error('Shopify env vars missing');

    const url = new URL(req.url, originFrom(req));
    const params = Object.fromEntries(url.searchParams.entries());
    const { code, shop, state } = params;
    if (!code || !shop || !state) throw new Error('Missing OAuth params');

    // 1. CSRF: cookie state must match the URL state
    const cookieState = readCookie(req, 'helm_oauth_state');
    if (state !== cookieState) throw new Error('OAuth state mismatch');
    const claims = verify(state);
    if (!claims || claims.provider !== 'shopify' || claims.shop !== shop) {
      throw new Error('OAuth state invalid');
    }

    // 2. Shopify HMAC validation
    if (!verifyHmac(params)) throw new Error('Shopify HMAC mismatch');

    // 3. Exchange the code for an access_token
    const token = await exchangeCode(shop, code);
    if (!token.access_token) throw new Error('No access_token returned');

    // 4. Fetch the shop record + order count so the post-connect
    //    notification can show a real number
    let shopInfo = null;
    let orderCount30d = null;
    try {
      shopInfo = await getShopInfo(shop, token.access_token);
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      orderCount30d = await countOrders(shop, token.access_token, { sinceIso: since });
    } catch (_) {}

    // 5. Persist (service-role write; token is server-only)
    await upsertIntegration(claims.uid, 'shopify', {
      status: 'connected',
      account_id: shop,
      account_label: (shopInfo && shopInfo.name) || shop.replace('.myshopify.com', ''),
      scopes: token.scope || SCOPES,
      access_token: token.access_token,
      connected_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      metadata: {
        currency: shopInfo?.currency || 'INR',
        country: shopInfo?.country_code || null,
        plan: shopInfo?.plan_name || null,
        timezone: shopInfo?.iana_timezone || null,
        order_count_30d: orderCount30d,
      },
    });
    await logEvent(claims.uid, 'shopify_connected', { shop, orderCount30d });

    // Real notification on successful connect — no seeded data
    try {
      const title = shopInfo
        ? `Shopify connected · ${shopInfo.name}`
        : `Shopify connected · ${shop.replace('.myshopify.com', '')}`;
      const body = orderCount30d != null
        ? `${orderCount30d.toLocaleString('en-IN')} orders detected in the last 30 days. HELM is now reading live data.`
        : 'HELM is now reading live data from your store.';
      await rest('notifications', {
        method: 'POST',
        body: { user_id: claims.uid, severity: 'success', kind: 'shopify_connected', title, body, read: false },
      });
    } catch (_) { /* notifications table missing → schema not applied; non-fatal */ }

    clearStateCookie(res);
    res.statusCode = 302;
    res.setHeader('Location', '/onboarding?connected=shopify');
    res.end();
  } catch (e) {
    console.error('shopify/callback error', e);
    clearStateCookie(res);
    res.statusCode = 302;
    res.setHeader('Location', '/onboarding?error=' + encodeURIComponent(e.message || 'Shopify connection failed'));
    res.end();
  }
};
