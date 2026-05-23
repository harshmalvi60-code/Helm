// HELM — Supabase REST helpers for serverless functions.
// We don't pull the JS SDK on the server to keep deploys zero-dependency.
// Each function: authorize the caller's JWT (RLS does the rest), or use the
// service-role key for system tasks like writing back synced data.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function hasSupabase() {
  return Boolean(SUPABASE_URL && (SERVICE_ROLE_KEY || ANON_KEY));
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

async function rest(table, { method = 'GET', query = '', body = null, useServiceRole = false, userToken = null, prefer } = {}) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const key = useServiceRole ? SERVICE_ROLE_KEY : (userToken || ANON_KEY);
  const headers = {
    apikey: useServiceRole ? SERVICE_ROLE_KEY : (ANON_KEY || SERVICE_ROLE_KEY),
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
    throw new Error(`Supabase ${method} ${table} failed: ${r.status} ${text}`);
  }
  if (r.status === 204) return null;
  return await r.json();
}

async function upsertIntegration(userId, provider, patch, userToken) {
  return rest('integrations', {
    method: 'POST',
    query: '?on_conflict=user_id,provider',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { user_id: userId, provider, ...patch },
    useServiceRole: !userToken,
    userToken,
  });
}

async function getIntegrations(userId, userToken) {
  return rest('integrations', {
    method: 'GET',
    query: `?user_id=eq.${userId}&select=*`,
    useServiceRole: !userToken,
    userToken,
  });
}

async function insertInsight(row, userToken) {
  return rest('insights', {
    method: 'POST',
    prefer: 'return=representation',
    body: row,
    useServiceRole: !userToken,
    userToken,
  });
}

async function insertReport(row, userToken) {
  return rest('reports', {
    method: 'POST',
    prefer: 'return=representation',
    body: row,
    useServiceRole: !userToken,
    userToken,
  });
}

async function logEvent(userId, event, metadata = {}) {
  try {
    await rest('audit_log', {
      method: 'POST',
      body: { user_id: userId, event, metadata },
      useServiceRole: true,
    });
  } catch (_) {
    /* best-effort */
  }
}

module.exports = {
  hasSupabase,
  bearerFromReq,
  getUserFromRequest,
  rest,
  upsertIntegration,
  getIntegrations,
  insertInsight,
  insertReport,
  logEvent,
};
