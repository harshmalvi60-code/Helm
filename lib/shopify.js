// HELM — Shopify Admin API client.
// Pure fetch wrapper that paginates the REST API. No SDK dependency.

const crypto = require('crypto');

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_products,read_customers,read_inventory,read_analytics';
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';

function hasShopify() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function requireShopify() {
  if (!hasShopify()) throw new Error('Shopify env vars missing: SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET');
}

function isValidShopDomain(shop) {
  return typeof shop === 'string' && /^[a-z0-9][a-z0-9-]{1,59}\.myshopify\.com$/i.test(shop);
}

function authorizeUrl({ shop, redirectUri, state }) {
  return `https://${shop}/admin/oauth/authorize`
    + `?client_id=${encodeURIComponent(CLIENT_ID)}`
    + `&scope=${encodeURIComponent(SCOPES)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${encodeURIComponent(state)}`;
}

// Verifies the HMAC parameter Shopify includes in the callback URL.
function verifyHmac(params) {
  if (!params || !params.hmac) return false;
  const { hmac, ...rest } = params;
  const sorted = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('&');
  const computed = crypto.createHmac('sha256', CLIENT_SECRET).update(sorted).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch (_) { return false; }
}

async function exchangeCode(shop, code) {
  if (!isValidShopDomain(shop)) throw new Error('Invalid shop domain');
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  });
  if (!r.ok) throw new Error('Shopify token exchange failed: ' + (await r.text()).slice(0, 300));
  return await r.json();
}

// ============ ADMIN API CALLS ============

async function adminGet(shop, accessToken, path) {
  const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Shopify GET ${path} ${r.status}: ${text.slice(0, 300)}`);
  }
  return await r.json();
}

async function getShopInfo(shop, accessToken) {
  const data = await adminGet(shop, accessToken, 'shop.json');
  return data.shop || null;
}

async function listOrders(shop, accessToken, { sinceIso, limit = 250 } = {}) {
  const params = new URLSearchParams({
    status: 'any',
    limit: String(limit),
    fields: 'id,name,created_at,processed_at,total_price,subtotal_price,total_tax,currency,financial_status,fulfillment_status,customer,line_items',
  });
  if (sinceIso) params.set('created_at_min', sinceIso);
  const data = await adminGet(shop, accessToken, 'orders.json?' + params.toString());
  return data.orders || [];
}

async function countOrders(shop, accessToken, { sinceIso } = {}) {
  const params = new URLSearchParams({ status: 'any' });
  if (sinceIso) params.set('created_at_min', sinceIso);
  const data = await adminGet(shop, accessToken, 'orders/count.json?' + params.toString());
  return data.count || 0;
}

async function listProducts(shop, accessToken, { limit = 50 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    fields: 'id,title,handle,variants,status,product_type,tags',
  });
  const data = await adminGet(shop, accessToken, 'products.json?' + params.toString());
  return data.products || [];
}

async function getCustomerCount(shop, accessToken) {
  const data = await adminGet(shop, accessToken, 'customers/count.json');
  return data.count || 0;
}

module.exports = {
  hasShopify,
  requireShopify,
  isValidShopDomain,
  authorizeUrl,
  verifyHmac,
  exchangeCode,
  getShopInfo,
  listOrders,
  countOrders,
  listProducts,
  getCustomerCount,
  SCOPES,
  API_VERSION,
};
