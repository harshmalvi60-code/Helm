// HELM — integration catalog + connection helpers.
// Shopify uses real OAuth (via /api/integrations/shopify/install).
// Other providers are placeholders until their OAuth flows are wired up —
// we mark them clearly as "Coming soon" in the UI.

(function () {
  'use strict';

  const CATALOG = [
    {
      id: 'shopify', name: 'Shopify', mark: 'S', markColor: '#95BF47',
      category: 'Ecommerce', live: true, required: true,
      desc: 'Orders, products, customers and inventory. The base layer of HELM.',
      scopes: 'read_orders, read_products, read_customers, read_inventory',
    },
    {
      id: 'meta', name: 'Meta Ads', mark: 'M', markColor: '#1877F2',
      category: 'Paid Acquisition', live: false,
      desc: 'Spend, ROAS, creative fatigue and audience health on Facebook + Instagram.',
      scopes: 'ads_read, business_management',
    },
    {
      id: 'google', name: 'Google Analytics', mark: 'G', markColor: '#E37400',
      category: 'Analytics', live: false,
      desc: 'GA4 sessions, conversions, attribution and channel-level CVR.',
      scopes: 'analytics.readonly',
    },
    {
      id: 'google-ads', name: 'Google Ads', mark: 'g', markColor: '#4285F4',
      category: 'Paid Acquisition', live: false,
      desc: 'Search, Shopping and PMax spend, CPA and ROAS by campaign.',
      scopes: 'adwords',
    },
    {
      id: 'klaviyo', name: 'Klaviyo', mark: 'K', markColor: '#000000',
      category: 'Email & SMS', live: false,
      desc: 'Lifecycle flows, retention, LTV and email/SMS revenue share.',
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
    if (provider === 'shopify') return startShopifyConnect();

    // Other providers — show coming-soon toast.
    window.HelmUI?.toast(friendlyName(provider) + ' OAuth is coming soon', 'info', 2200);
    return { skipped: true };
  }

  function startShopifyConnect() {
    return new Promise((resolve) => {
      const existing = document.getElementById('shopifyConnectModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'shopifyConnectModal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(8px);z-index:300;display:grid;place-items:center;padding:20px;';
      modal.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-strong);border-radius:var(--r-lg);max-width:440px;width:100%;box-shadow:var(--shadow-4);padding:28px;">
          <div class="flex items-center gap-3 mb-3">
            <div class="integ-logo" style="background:#95BF47;color:#fff;width:36px;height:36px;font-size:16px;">S</div>
            <div>
              <div class="panel-title">Connect Shopify</div>
              <div class="panel-sub">HELM uses Shopify's OAuth — we never see your password.</div>
            </div>
          </div>

          <div class="form-group mt-4">
            <label class="form-label">Your Shopify store URL</label>
            <div style="position:relative;">
              <input class="form-input" id="shopUrlInp" placeholder="yourstore" autocomplete="off" autocapitalize="off" autocorrect="off" style="padding-right:130px;" />
              <span class="text-tertiary mono" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:13px;pointer-events:none;">.myshopify.com</span>
            </div>
            <div class="form-hint">e.g. <span class="mono">acme-coffee</span> if your store is <span class="mono">acme-coffee.myshopify.com</span></div>
          </div>

          <div class="alert info text-sm" style="margin-top:18px;margin-bottom:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span>Read-only access to orders, products, customers and inventory. We never write to your store.</span>
          </div>

          <div class="flex gap-2 mt-5" style="justify-content:flex-end;">
            <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
            <button class="btn btn-primary" id="continueBtn" disabled>Continue to Shopify →</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const input = modal.querySelector('#shopUrlInp');
      const cont = modal.querySelector('#continueBtn');
      setTimeout(() => input.focus(), 50);

      const close = (val) => { modal.remove(); resolve(val); };
      modal.querySelector('#cancelBtn').addEventListener('click', () => close({ cancelled: true }));
      modal.addEventListener('click', (e) => { if (e.target === modal) close({ cancelled: true }); });

      input.addEventListener('input', () => {
        cont.disabled = !cleanShop(input.value);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !cont.disabled) cont.click(); });

      cont.addEventListener('click', () => {
        const shop = cleanShop(input.value);
        if (!shop) return;
        cont.disabled = true;
        cont.innerHTML = '<span class="spinner"></span> Redirecting…';
        // Server route returns a 302 to Shopify's authorize URL.
        window.location.href = '/api/integrations/shopify/install?shop=' + encodeURIComponent(shop);
      });
    });
  }

  function cleanShop(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!s.endsWith('.myshopify.com')) s = s.replace(/\.myshopify\.com.*/, '') + '.myshopify.com';
    if (!/^[a-z0-9][a-z0-9-]{1,59}\.myshopify\.com$/.test(s)) return null;
    return s;
  }

  async function disconnect(provider, userId) {
    const sb = await window.HelmSupabase.getClient();
    await sb.from('integrations').delete().eq('user_id', userId).eq('provider', provider);
    window.HelmUI?.toast(friendlyName(provider) + ' disconnected', 'success', 1400);
  }

  function friendlyName(id) {
    const c = CATALOG.find((x) => x.id === id);
    return c ? c.name : id;
  }

  function renderCard(integ, connection) {
    const isConnected = connection && connection.status === 'connected';
    const live = integ.live;
    const label = isConnected
      ? `Connected · ${escapeHtml(connection.account_label || connection.account_id || 'live')}`
      : live ? 'Not connected' : 'Coming soon';
    return `
      <div class="integ-card ${isConnected ? 'connected' : ''}" data-provider="${integ.id}">
        <div class="integ-head">
          <div class="integ-logo" style="background:${integ.markColor};color:#fff;">${integ.mark}</div>
          <div>
            <div class="integ-name">${integ.name}</div>
            <div class="text-tertiary mono" style="font-size:11px;">${integ.category}</div>
          </div>
          ${integ.required ? '<span class="tag neutral" style="margin-left:auto;">Required</span>' : ''}
          ${!live && !integ.required ? '<span class="tag info" style="margin-left:auto;">Soon</span>' : ''}
        </div>
        <div class="integ-desc">${integ.desc}</div>
        <div class="integ-status">
          <span class="status-dot ${isConnected ? 'live' : ''}"></span>
          <span class="text-muted">${label}</span>
        </div>
        <div class="flex gap-2 mt-3">
          ${isConnected
            ? `<button class="btn btn-subtle btn-sm js-disconnect" data-p="${integ.id}">Disconnect</button>
               <button class="btn btn-ghost btn-sm js-sync" data-p="${integ.id}">Resync</button>`
            : live
              ? `<button class="btn btn-primary btn-sm w-full js-connect" data-p="${integ.id}">Connect ${integ.name}</button>`
              : `<button class="btn btn-subtle btn-sm w-full" disabled>Coming soon</button>`
          }
        </div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.HelmIntegrations = { CATALOG, listConnections, startConnect, disconnect, renderCard };
})();
