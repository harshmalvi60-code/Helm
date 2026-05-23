// GET /api/integrations/shopify/install?shop=mystore.myshopify.com
// Starts the Shopify OAuth flow (custom app or partner app).
// Requires the caller to be authenticated; we sign a state cookie with the user id
// so the callback can persist the token against the right account.

const { getUserFromRequest } = require('../../../lib/supabase');
const { sign, setStateCookie, originFrom } = require('../../../lib/oauth');

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_products,read_customers,read_inventory,read_analytics';

module.exports = async (req, res) => {
  const user = await getUserFromRequest(req).catch(() => null);
  if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
  if (!CLIENT_ID) { res.redirect(302, '/onboarding?error=' + encodeURIComponent('Shopify is not configured. Add SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in env.')); return; }

  const url = new URL(req.url, originFrom(req));
  const shop = url.searchParams.get('shop');
  if (!shop || !/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) {
    res.status(400).json({ error: 'Pass ?shop=yourstore.myshopify.com' });
    return;
  }

  const state = sign({ uid: user.id, shop, provider: 'shopify' });
  setStateCookie(res, state);

  const redirectUri = originFrom(req) + '/api/integrations/shopify/callback';
  const authorize = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  res.redirect(302, authorize);
};
