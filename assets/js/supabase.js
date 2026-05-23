// HELM — Supabase browser client (loaded as a global via CDN)
// Frontend-only MVP: reads optional config from window.HELM_CONFIG
// (set on the page) or falls back to demo mode using localStorage.
// To go live, drop your Supabase URL + anon key into window.HELM_CONFIG
// in any page <head> before this script loads.

(function () {
  'use strict';

  function loadConfig() {
    if (window.HELM_CONFIG && window.HELM_CONFIG.supabaseUrl) return window.HELM_CONFIG;
    return { supabaseUrl: '', supabaseAnonKey: '', demoMode: true };
  }

  async function getClient() {
    if (window.__helmSupabase) return window.__helmSupabase;

    const cfg = loadConfig();
    window.HELM_CONFIG = cfg;

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      // Demo mode: stub client that pretends auth works using localStorage.
      window.__helmSupabase = createDemoClient();
      return window.__helmSupabase;
    }

    // Wait for the supabase-js CDN script to be present
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
        },
      }
    );
    return window.__helmSupabase;
  }

  function createDemoClient() {
    const KEY = 'helm:demo:user';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
    const write = (u) => localStorage.setItem(KEY, JSON.stringify(u));
    const clear = () => localStorage.removeItem(KEY);

    return {
      _demo: true,
      auth: {
        async getSession() {
          const u = read();
          return { data: { session: u ? { user: u } : null }, error: null };
        },
        async getUser() {
          const u = read();
          return { data: { user: u }, error: u ? null : { message: 'No session' } };
        },
        async signInWithPassword({ email }) {
          if (!email) return { data: null, error: { message: 'Email required' } };
          const u = { id: 'demo-' + btoa(email).slice(0, 12), email, user_metadata: { full_name: email.split('@')[0] } };
          write(u);
          return { data: { user: u, session: { user: u } }, error: null };
        },
        async signUp({ email, password, options }) {
          if (!email || !password) return { data: null, error: { message: 'Email & password required' } };
          if (password.length < 8) return { data: null, error: { message: 'Password must be at least 8 characters' } };
          const u = { id: 'demo-' + btoa(email).slice(0, 12), email, user_metadata: options?.data || {} };
          write(u);
          return { data: { user: u, session: { user: u } }, error: null };
        },
        async signInWithOAuth({ provider }) {
          // demo: no real OAuth, just simulate
          const email = `${provider}-user@demo.helm.ai`;
          const u = { id: 'demo-' + provider, email, user_metadata: { full_name: provider + ' user' } };
          write(u);
          window.location.href = '/onboarding';
          return { data: { url: '/onboarding' }, error: null };
        },
        async signOut() { clear(); return { error: null }; },
        onAuthStateChange(cb) {
          const handler = () => cb('SIGNED_IN', { user: read() });
          window.addEventListener('storage', handler);
          return { data: { subscription: { unsubscribe: () => window.removeEventListener('storage', handler) } } };
        },
        async resetPasswordForEmail() { return { data: {}, error: null }; },
      },
      from(table) {
        // Demo in-memory tables (per-tab) for the dashboard to work without a backend
        const STORE_KEY = 'helm:demo:db:' + table;
        const all = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (_) { return []; } };
        const persist = (rows) => localStorage.setItem(STORE_KEY, JSON.stringify(rows));

        const builder = {
          _rows: all(),
          _filters: [],
          _order: null,
          _limit: null,
          select() { return builder; },
          eq(col, val) { builder._filters.push((r) => r[col] === val); return builder; },
          order(col, opts) { builder._order = { col, asc: !(opts && opts.ascending === false) }; return builder; },
          limit(n) { builder._limit = n; return builder; },
          async maybeSingle() { const r = await builder.then(); return { data: r.data && r.data[0] ? r.data[0] : null, error: null }; },
          async single() { const r = await builder.then(); return { data: r.data && r.data[0], error: r.data && r.data[0] ? null : { message: 'Not found' } }; },
          insert(rows) {
            const arr = Array.isArray(rows) ? rows : [rows];
            const stamped = arr.map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
            persist(all().concat(stamped));
            return Promise.resolve({ data: stamped, error: null });
          },
          upsert(rows, opts) {
            const arr = Array.isArray(rows) ? rows : [rows];
            const onConflict = (opts && opts.onConflict) || 'id';
            const keys = onConflict.split(',').map((s) => s.trim()).filter(Boolean);
            const current = all();
            arr.forEach((r) => {
              const idx = current.findIndex((c) => keys.every((k) => c[k] !== undefined && c[k] === r[k]));
              if (idx >= 0) current[idx] = { ...current[idx], ...r };
              else current.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r });
            });
            persist(current);
            return Promise.resolve({ data: arr, error: null });
          },
          update(patch) {
            const filters = [];
            const u = {
              eq(col, val) { filters.push([col, val]); return u; },
              then(resolve, reject) {
                const matches = (r) => filters.every(([c, v]) => r[c] === v);
                const updated = all().map((r) => (matches(r) ? { ...r, ...patch } : r));
                persist(updated);
                return Promise.resolve({ data: updated.filter(matches), error: null }).then(resolve, reject);
              },
            };
            return u;
          },
          delete() {
            const filters = [];
            const d = {
              eq(col, val) { filters.push([col, val]); return d; },
              then(resolve, reject) {
                const matches = (r) => filters.every(([c, v]) => r[c] === v);
                persist(all().filter((r) => !matches(r)));
                return Promise.resolve({ data: null, error: null }).then(resolve, reject);
              },
            };
            return d;
          },
          then(resolve, reject) {
            let rows = all();
            for (const f of builder._filters) rows = rows.filter(f);
            if (builder._order) {
              const { col, asc } = builder._order;
              rows.sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1));
            }
            if (builder._limit) rows = rows.slice(0, builder._limit);
            const p = Promise.resolve({ data: rows, error: null });
            return p.then(resolve, reject);
          },
        };
        return builder;
      },
    };
  }

  async function currentUser() {
    const c = await getClient();
    const { data } = await c.auth.getUser();
    return data?.user || null;
  }

  async function requireAuth() {
    const u = await currentUser();
    if (!u) {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
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
