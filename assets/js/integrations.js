// HELM — integration catalog + connection helpers.
// Drives /onboarding and /settings. Frontend-only MVP: connections are
// simulated against the local Supabase client. Wire to real OAuth later.

(function () {
  'use strict';

  const CATALOG = [
    {
      id: 'shopify',
      name: 'Shopify',
      mark: 'S',
      markColor: '#95BF47',
      category: 'Ecommerce',
      desc: 'Orders, products, customers, checkouts. The base layer of HELM.',
      required: true,
      scopes: 'read_orders, read_products, read_customers, read_inventory',
    },
    {
      id: 'meta',
      name: 'Meta Ads',
      mark: 'M',
      markColor: '#1877F2',
      category: 'Paid Acquisition',
      desc: 'Spend, ROAS, creative fatigue, and audience health on Facebook + Instagram.',
      required: true,
      scopes: 'ads_read, business_management',
    },
    {
      id: 'google',
      name: 'Google Analytics',
      mark: 'G',
      markColor: '#E37400',
      category: 'Analytics',
      desc: 'GA4 sessions, conversions, attribution and channel-level CVR.',
      required: false,
      scopes: 'analytics.readonly',
    },
    {
      id: 'google-ads',
      name: 'Google Ads',
      mark: 'g',
      markColor: '#4285F4',
      category: 'Paid Acquisition',
      desc: 'Search, Shopping, PMax — spend, CPA, ROAS by campaign.',
      required: false,
      scopes: 'adwords',
    },
    {
      id: 'klaviyo',
      name: 'Klaviyo',
      mark: 'K',
      markColor: '#000000',
      category: 'Email & SMS',
      desc: 'Lifecycle flows, retention, customer LTV and email/SMS revenue share.',
      required: false,
      scopes: 'campaigns:read, profiles:read, metrics:read',
    },
  ];

  async function listConnections(userId) {
    const sb = await window.HelmSupabase.getClient();
    const { data } = await sb.from('integrations').select().eq('user_id', userId);
    const map = {};
    (data || []).forEach((row) => { map[row.provider] = row; });
    return map;
  }

  async function startConnect(provider) {
    // Frontend-only MVP: simulate a successful OAuth round-trip and
    // persist the "connection" against the user. To wire up real OAuth
    // later you'll need a backend (Supabase Edge Function or Vercel Pro)
    // since the client_secret can't live in the browser.
    const sb = await window.HelmSupabase.getClient();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return;

    // Brief delay so the connect spinner reads as a real round-trip.
    await new Promise((r) => setTimeout(r, 700));

    await sb.from('integrations').upsert({
      user_id: u.user.id,
      provider,
      status: 'connected',
      connected_at: new Date().toISOString(),
      account_label: friendlyAccount(provider),
    }, { onConflict: 'user_id,provider' });

    window.HelmUI?.toast(friendlyName(provider) + ' connected', 'success');
    return { demo: true };
  }

  function friendlyName(p) {
    const c = (window.HelmIntegrations?.CATALOG || []).find((x) => x.id === p);
    return c ? c.name : p;
  }
  function friendlyAccount(p) {
    return ({
      shopify: 'demo-store.myshopify.com',
      meta: 'Acme Coffee · Ad Account',
      google: 'GA4-348293742',
      'google-ads': '847-293-1102',
      klaviyo: 'acme-coffee',
    })[p] || p + '-demo';
  }

  async function disconnect(provider, userId) {
    const sb = await window.HelmSupabase.getClient();
    await sb.from('integrations').delete().eq('user_id', userId).eq('provider', provider);
    window.HelmUI?.toast(provider + ' disconnected', 'success');
  }

  function renderCard(integ, connection) {
    const isConnected = connection && connection.status === 'connected';
    return `
      <div class="integ-card ${isConnected ? 'connected' : ''}" data-provider="${integ.id}">
        <div class="integ-head">
          <div class="integ-logo" style="background:${integ.markColor};color:#fff;">${integ.mark}</div>
          <div>
            <div class="integ-name">${integ.name}</div>
            <div class="text-tertiary mono" style="font-size:11px;">${integ.category}</div>
          </div>
          ${integ.required ? '<span class="tag neutral" style="margin-left:auto;">Required</span>' : ''}
        </div>
        <div class="integ-desc">${integ.desc}</div>
        <div class="integ-status">
          <span class="status-dot ${isConnected ? 'live' : ''}"></span>
          <span class="text-muted">${isConnected ? 'Connected · ' + (connection.account_label || 'live') : 'Not connected'}</span>
        </div>
        <div class="flex gap-2 mt-3">
          ${isConnected
            ? `<button class="btn btn-subtle btn-sm js-disconnect" data-p="${integ.id}">Disconnect</button>
               <button class="btn btn-ghost btn-sm js-sync" data-p="${integ.id}">Resync now</button>`
            : `<button class="btn btn-primary btn-sm w-full js-connect" data-p="${integ.id}">Connect ${integ.name}</button>`
          }
        </div>
      </div>
    `;
  }

  window.HelmIntegrations = { CATALOG, listConnections, startConnect, disconnect, renderCard };
})();
