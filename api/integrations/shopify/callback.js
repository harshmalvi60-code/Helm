// GET /api/integrations/shopify/callback?code=&shop=&state=&hmac=&timestamp=
// Validates HMAC + state, exchanges code → access_token, stores it securely.

const { verify, readCookie, clearStateCookie, originFrom } = require('../../../lib/oauth');
const { upsertIntegration, logEvent } = require('../../../lib/supabase');
const { verifyHmac, exchangeCode, getShopInfo, hasShopify, SCOPES } = require('../../../lib/shopify');

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

    // 4. Fetch the shop record so we have a friendly label
    let shopInfo = null;
    try { shopInfo = await getShopInfo(shop, token.access_token); } catch (_) {}

    // 5. Persist (service-role write; token is server-only)
    await upsertIntegration(claims.uid, 'shopify', {
      status: 'connected',
      account_id: shop,
      account_label: (shopInfo && shopInfo.name) || shop.replace('.myshopify.com', ''),
      scopes: token.scope || SCOPES,
      access_token: token.access_token,
      connected_at: new Date().toISOString(),
      metadata: {
        currency: shopInfo?.currency || 'INR',
        country: shopInfo?.country_code || null,
        plan: shopInfo?.plan_name || null,
        timezone: shopInfo?.iana_timezone || null,
      },
    });
    await logEvent(claims.uid, 'shopify_connected', { shop });

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
