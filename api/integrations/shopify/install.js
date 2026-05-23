// GET /api/integrations/shopify/install?shop=mystore.myshopify.com
// Starts the Shopify OAuth flow. Requires a signed-in HELM user.

const { getUserFromRequest } = require('../../../lib/supabase');
const { sign, setStateCookie, originFrom, queryParam } = require('../../../lib/oauth');
const { hasShopify, isValidShopDomain, authorizeUrl } = require('../../../lib/shopify');

module.exports = async (req, res) => {
  try {
    if (!hasShopify()) {
      return redirectError(res, 'Shopify is not configured. Set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.');
    }
    const user = await getUserFromRequest(req).catch(() => null);
    if (!user) {
      return redirectError(res, 'Sign in first', '/login');
    }

    const shop = (queryParam(req, 'shop') || '').toLowerCase().trim();
    if (!isValidShopDomain(shop)) {
      return redirectError(res, 'Enter a valid Shopify domain like yourstore.myshopify.com');
    }

    const state = sign({ uid: user.id, shop, provider: 'shopify' });
    setStateCookie(res, state);

    const redirectUri = originFrom(req) + '/api/integrations/shopify/callback';
    const url = authorizeUrl({ shop, redirectUri, state });
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.end();
  } catch (e) {
    console.error('shopify/install error', e);
    redirectError(res, e.message || 'Could not start Shopify connect');
  }
};

function redirectError(res, msg, path = '/onboarding') {
  res.statusCode = 302;
  res.setHeader('Location', path + '?error=' + encodeURIComponent(msg));
  res.end();
}
