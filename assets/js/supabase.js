// HELM — Supabase browser client.
// Production-only: fetches public config from /api/config, then talks to
// real Supabase. If the deployment isn't configured (missing env vars),
// the user is sent to /setup-required.html with a clear checklist.
// There is no demo / localStorage stub — every read/write hits real Supabase.

(function () {
  'use strict';

  const SETUP_PAGES = new Set(['/setup-required', '/setup-required.html', '/']);
  let configPromise = null;

  async function loadConfig() {
    if (window.HELM_CONFIG?.supabaseUrl) return window.HELM_CONFIG;
    if (configPromise) return configPromise;
    configPromise = (async () => {
      try {
        const r = await fetch('/api/config', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('config endpoint ' + r.status);
        const cfg = await r.json();
        window.HELM_CONFIG = cfg;
        return cfg;
      } catch (e) {
        return { configured: false, error: e.message };
      }
    })();
    return configPromise;
  }

  function bounceToSetup(missing) {
    const here = window.location.pathname;
    if (SETUP_PAGES.has(here)) return;
    const qs = missing ? '?missing=' + encodeURIComponent(Object.keys(missing).filter((k) => missing[k]).join(',')) : '';
    window.location.href = '/setup-required' + qs;
  }

  async function getClient() {
    if (window.__helmSupabase) return window.__helmSupabase;
    const cfg = await loadConfig();

    if (!cfg.configured || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      bounceToSetup(cfg.missing);
      // Return a stub that rejects every call rather than crashing
      // the page mid-render while the redirect happens.
      return makeNoopClient();
    }

    if (!window.supabase || !window.supabase.createClient) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    window.__helmSupabase = window.supabase.createClient(
      cfg.supabaseUrl,
      cfg.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage,
          flowType: 'pkce',
        },
      }
    );
    return window.__helmSupabase;
  }

  // A non-throwing client used only during the brief moment between
  // detecting "not configured" and the browser actually navigating to
  // /setup-required. Every method returns an empty/null result so the
  // calling page doesn't crash before the redirect lands.
  function makeNoopClient() {
    const empty = () => Promise.resolve({ data: null, error: { message: 'Not configured' } });
    const list  = () => Promise.resolve({ data: [], error: null });
    const builder = () => {
      const b = {
        select: () => b, eq: () => b, order: () => b, limit: () => b,
        insert: empty, upsert: empty,
        update: () => ({ eq: empty }),
        delete: () => ({ eq: empty }),
        single: empty, maybeSingle: empty,
        then(resolve) { return list().then(resolve); },
      };
      return b;
    };
    return {
      _noop: true,
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser:    () => Promise.resolve({ data: { user: null }, error: null }),
        signInWithPassword: empty,
        signUp:             empty,
        signInWithOAuth:    empty,
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange:  () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: builder,
    };
  }

  async function currentUser() {
    const c = await getClient();
    if (c._noop) return null;
    const { data } = await c.auth.getUser();
    return data?.user || null;
  }

  async function requireAuth() {
    const cfg = await loadConfig();
    if (!cfg.configured) return null;     // bounceToSetup already triggered
    const u = await currentUser();
    if (!u) {
      const here = window.location.pathname;
      window.location.href = '/login?next=' + encodeURIComponent(here);
      return null;
    }
    return u;
  }

  async function signOut() {
    const c = await getClient();
    await c.auth.signOut();
    window.location.href = '/';
  }

  window.HelmSupabase = { getClient, currentUser, requireAuth, signOut, loadConfig };
})();
