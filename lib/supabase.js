// HELM — server-side Supabase REST helpers.
// Uses the service-role key for token writes and the user's JWT for reads.
// Zero npm dependencies; native fetch only.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

function hasSupabase() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

function requireSupabase() {
  if (!hasSupabase()) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function bearerFromReq(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

async function getUserFromRequest(req) {
  if (!hasSupabase()) return null;
  const token = bearerFromReq(req);
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: 'Bearer ' + token, apikey: ANON_KEY || SERVICE_ROLE_KEY },
  });
  if (!r.ok) return null;
  return await r.json();
}

async function rest(table, { method = 'GET', query = '', body = null, useServiceRole = true, prefer } = {}) {
  requireSupabase();
  const key = useServiceRole ? SERVICE_ROLE_KEY : ANON_KEY;
  const headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;

  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Supabase ${method} ${table} failed: ${r.status} ${text.slice(0, 300)}`);
  }
  if (r.status === 204) return null;
  return await r.json();
}

async function upsertIntegration(userId, provider, patch) {
  return rest('integrations', {
    method: 'POST',
    query: '?on_conflict=user_id,provider',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { user_id: userId, provider, ...patch },
  });
}

async function getIntegration(userId, provider) {
  const rows = await rest('integrations', {
    method: 'GET',
    query: `?user_id=eq.${userId}&provider=eq.${provider}&select=*&limit=1`,
  });
  return rows && rows[0] ? rows[0] : null;
}

async function logEvent(userId, event, metadata = {}) {
  try {
    await rest('audit_log', {
      method: 'POST',
      body: { user_id: userId, event, metadata },
    });
  } catch (_) { /* best-effort */ }
}

module.exports = {
  hasSupabase,
  requireSupabase,
  bearerFromReq,
  getUserFromRequest,
  rest,
  upsertIntegration,
  getIntegration,
  logEvent,
};
