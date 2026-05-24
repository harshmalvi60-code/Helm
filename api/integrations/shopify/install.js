// GET /api/integrations/shopify/install?shop=mystore.myshopify.com
//
// Starts Shopify OAuth as a standalone external SaaS — plain 302 to
// Shopify's authorize URL. Requires the caller to be signed into HELM
// (Supabase session) so we can scope the resulting token to that user.

const { getUserFromRequest } = require('../../../lib/supabase');
const { sign, setStateCookie, originFrom, queryParam } = require('../../../lib/oauth');
const { hasShopify, isValidShopDomain, authorizeUrl } = require('../../../lib/shopify');

module.exports = async (req, res) => {
  try {
    if (!hasShopify()) {
      return redirect(res, '/onboarding?error=' + encodeURIComponent('Shopify is not configured. Set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.'));
    }
    const user = await getUserFromRequest(req).catch(() => null);
    if (!user) {
      return redirect(res, '/login?next=/onboarding&error=' + encodeURIComponent('Sign in first'));
    }

    const shop = (queryParam(req, 'shop') || '').toLowerCase().trim();
    if (!isValidShopDomain(shop)) {
      return redirect(res, '/onboarding?error=' + encodeURIComponent('Enter a valid Shopify domain like yourstore.myshopify.com'));
    }

    const state = sign({ uid: user.id, shop, provider: 'shopify' });
    setStateCookie(res, state);

    const redirectUri = originFrom(req) + '/api/integrations/shopify/callback';
    return redirect(res, authorizeUrl({ shop, redirectUri, state }));
  } catch (e) {
    console.error('shopify/install error', e);
    return redirect(res, '/onboarding?error=' + encodeURIComponent(e.message || 'Could not start Shopify connect'));
  }
};

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
