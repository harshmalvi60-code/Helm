// HELM — renders the sidebar + auth gate for every authenticated page.

(function () {
  'use strict';

  const NAV = [
    { group: 'Workspace', items: [
      { href: '/dashboard', label: 'Dashboard', icon: iconHome() },
      { href: '/insights',  label: 'AI Insights', icon: iconBolt(), badge: 'AI' },
    ]},
    { group: 'Connections', items: [
      { href: '/onboarding', label: 'Integrations', icon: iconPlug() },
      { href: '/settings',   label: 'Settings',     icon: iconCog() },
    ]},
    { group: 'Account', items: [
      { href: '/pricing',  label: 'Plans & Billing', icon: iconSpark() },
    ]},
  ];

  function iconHome() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></svg>'; }
  function iconBolt() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'; }
  function iconPlug() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M7 8h10v4a5 5 0 0 1-10 0z"/><path d="M12 17v5"/></svg>'; }
  function iconCog() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.16.66.42.86.74.2.32.31.69.31 1.06V11"/></svg>'; }
  function iconSpark() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/></svg>'; }

  function initials(name, email) {
    const src = (name || email || '?').trim();
    const parts = src.split(/[\s@]+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }

  async function mount({ active }) {
    const user = await window.HelmSupabase.requireAuth();
    if (!user) return null;

    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || user.email?.split('@')[0] || 'Founder';
    const plan = (await loadPlan(user)) || 'Free Trial';

    document.body.classList.add('app-bg');

    const root = document.getElementById('app-root') || document.body;
    const shell = document.createElement('div');
    shell.className = 'app';
    shell.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <a href="/dashboard" class="sidebar-logo">
          <span class="mark"></span>
          <span>HELM</span>
        </a>
        ${NAV.map((g) => `
          <div class="nav-section-label">${g.group}</div>
          ${g.items.map((i) => `
            <a href="${i.href}" class="nav-item ${active === i.href ? 'active' : ''}">
              ${i.icon}
              <span>${i.label}</span>
              ${i.badge ? `<span class="badge">${i.badge}</span>` : ''}
            </a>
          `).join('')}
        `).join('')}

        <div class="sidebar-foot">
          <div class="user-chip" id="userChip">
            <div class="avatar">${initials(name, user.email)}</div>
            <div class="meta">
              <div class="name">${escapeHtml(name)}</div>
              <div class="plan">${escapeHtml(plan)}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
      </aside>

      <div class="mobile-bar">
        <a href="/dashboard" class="sidebar-logo" style="padding:0;margin:0;">
          <span class="mark"></span><span>HELM</span>
        </a>
        <button class="menu-btn" id="menuBtn" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>

      <main class="main" id="appMain">
        ${root.innerHTML}
      </main>
    `;

    root.innerHTML = '';
    root.appendChild(shell);

    document.getElementById('menuBtn')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
    document.getElementById('userChip')?.addEventListener('click', () => {
      if (confirm('Sign out of HELM?')) window.HelmSupabase.signOut();
    });

    return { user, plan };
  }

  async function loadPlan(user) {
    try {
      const sb = await window.HelmSupabase.getClient();
      const { data } = await sb.from('subscriptions').select().eq('user_id', user.id).limit(1);
      if (data && data[0]) return planLabel(data[0].plan, data[0].status);
    } catch (_) {}
    return 'Free Trial';
  }

  function planLabel(plan, status) {
    const map = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };
    const base = map[plan] || 'Free Trial';
    if (status === 'trialing') return base + ' · Trial';
    return base;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  window.HelmShell = { mount };
})();
