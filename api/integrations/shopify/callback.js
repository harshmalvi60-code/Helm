// GET /api/integrations/shopify/callback?code=...&shop=...&state=...&hmac=...
// Verifies HMAC, exchanges the code for an access token, persists the
// connection row, then bounces back to /onboarding.

const crypto = require('crypto');
const { verify, readCookie, clearStateCookie, originFrom } = require('../../../lib/oauth');
const { upsertIntegration, logEvent } = require('../../../lib/supabase');

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

module.exports = async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Shopify env vars missing');

    const url = new URL(req.url, originFrom(req));
    const params = Object.fromEntries(url.searchParams.entries());
    const { code, shop, state, hmac } = params;

    // 1. State (CSRF) check — must match the signed cookie + decode to a user id
    const cookieState = readCookie(req, 'helm_oauth_state');
    if (!state || state !== cookieState) throw new Error('State mismatch');
    const claims = verify(state);
    if (!claims || claims.provider !== 'shopify' || claims.shop !== shop) throw new Error('Invalid state');

    // 2. HMAC verification (Shopify requirement)
    if (!verifyShopifyHmac(params, CLIENT_SECRET)) throw new Error('HMAC mismatch');

    // 3. Code exchange
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });
    if (!tokenRes.ok) throw new Error('Token exchange failed: ' + (await tokenRes.text()));
    const token = await tokenRes.json();

    // 4. Persist
    await upsertIntegration(claims.uid, 'shopify', {
      status: 'connected',
      account_id: shop,
      account_label: shop.replace('.myshopify.com', ''),
      scopes: token.scope,
      access_token: token.access_token,
      connected_at: new Date().toISOString(),
    });
    await logEvent(claims.uid, 'integration_connected', { provider: 'shopify', shop });

    clearStateCookie(res);
    res.redirect(302, '/onboarding?connected=shopify');
  } catch (e) {
    console.error('shopify/callback error', e);
    clearStateCookie(res);
    res.redirect(302, '/onboarding?error=' + encodeURIComponent(e.message));
  }
};

function verifyShopifyHmac(params, secret) {
  const { hmac, ...rest } = params;
  if (!hmac) return false;
  const sorted = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('&');
  const computed = crypto.createHmac('sha256', secret).update(sorted).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(hmac, 'utf8')); }
  catch (_) { return false; }
}
