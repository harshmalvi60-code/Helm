// HELM — OAuth helper shared by /api/integrations/* routes.
// Encrypts the state cookie so we can verify the callback came from us
// without storing a row server-side just for the round-trip.

const crypto = require('crypto');

const SECRET = process.env.HELM_OAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret-change-me-now-pls';

function sign(payload) {
  const json = JSON.stringify({ ...payload, t: Date.now() });
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verify(state, maxAgeMs = 10 * 60 * 1000) {
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
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function setStateCookie(res, value) {
  // Short-lived secure cookie carrying the signed state.
  res.setHeader('Set-Cookie', [
    `helm_oauth_state=${value}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
  ]);
}

function readCookie(req, name) {
  const c = (req.headers?.cookie || '').split(';').map((s) => s.trim());
  const hit = c.find((x) => x.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function clearStateCookie(res) {
  res.setHeader('Set-Cookie', ['helm_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure']);
}

function originFrom(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body) {
      if (typeof req.body === 'object') return resolve(req.body);
      try { return resolve(JSON.parse(req.body)); } catch (_) { return resolve({}); }
    }
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = { sign, verify, setStateCookie, readCookie, clearStateCookie, originFrom, readJsonBody };
