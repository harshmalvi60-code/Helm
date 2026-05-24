// HELM — OAuth state cookie + request helpers.
// State is HMAC-signed so the callback can verify the round-trip
// without holding a row server-side.

const crypto = require('crypto');

const SECRET = process.env.HELM_OAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireSecret() {
  if (!SECRET || SECRET.length < 16) {
    throw new Error('HELM_OAUTH_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to a 16+ char secret.');
  }
}

function sign(payload) {
  requireSecret();
  const json = JSON.stringify({ ...payload, t: Date.now() });
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verify(state, maxAgeMs = 10 * 60 * 1000) {
  requireSecret();
  if (!state || typeof state !== 'string' || !state.includes('.')) return null;
  const [b64, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const obj = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (Date.now() - obj.t > maxAgeMs) return null;
    return obj;
  } catch (_) { return null; }
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Standalone external SaaS: SameSite=Lax is the correct default for
// first-party OAuth flows — the cookie is set during the install
// request and must survive the Shopify-side redirect back to our
// callback. Secure + HttpOnly + 10-min expiry.
function setStateCookie(res, value) {
  res.setHeader('Set-Cookie', [
    `helm_oauth_state=${value}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
  ]);
}

function clearStateCookie(res) {
  res.setHeader('Set-Cookie', ['helm_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure']);
}

function readCookie(req, name) {
  const c = (req.headers?.cookie || '').split(';').map((s) => s.trim());
  const hit = c.find((x) => x.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function originFrom(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function queryParam(req, name) {
  try {
    const u = new URL(req.url, originFrom(req));
    return u.searchParams.get(name);
  } catch (_) { return null; }
}

module.exports = { sign, verify, setStateCookie, readCookie, clearStateCookie, originFrom, queryParam };
