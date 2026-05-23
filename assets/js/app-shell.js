// HELM — premium app shell.
// Renders sidebar + top bar (search, notifications, user menu) for every
// authenticated page. Auth-gated: redirects to /login if no session.

(function () {
  'use strict';

  const NAV = [
    { group: 'Workspace', items: [
      { href: '/dashboard', label: 'Dashboard',  icon: iconHome() },
      { href: '/insights',  label: 'AI Insights', icon: iconBolt(), badge: 'AI' },
      { href: '/reports',   label: 'Reports',     icon: iconDoc() },
    ]},
    { group: 'Sources', items: [
      { href: '/onboarding', label: 'Integrations', icon: iconPlug() },
    ]},
    { group: 'Account', items: [
      { href: '/profile',  label: 'Profile',         icon: iconUser() },
      { href: '/settings', label: 'Settings',        icon: iconCog() },
      { href: '/pricing',  label: 'Plans & Billing', icon: iconSpark() },
    ]},
  ];

  function iconHome()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></svg>'; }
  function iconBolt()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'; }
  function iconPlug()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M7 8h10v4a5 5 0 0 1-10 0z"/><path d="M12 17v5"/></svg>'; }
  function iconCog()   { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9"/></svg>'; }
  function iconSpark() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>'; }
  function iconDoc()   { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'; }
  function iconUser()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>'; }
  function iconBell()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>'; }
  function iconSearch(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'; }
  function iconLogout(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'; }

  function initials(name, email) {
    const src = (name || email || '?').trim();
    const parts = src.split(/[\s@._-]+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }

  async function mount({ active, title }) {
    const user = await window.HelmSupabase.requireAuth();
    if (!user) return null;

    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || (user.email && user.email.split('@')[0]) || 'Founder';
    const plan = await loadPlan(user);

    document.body.classList.add('app-bg');

    const root = document.getElementById('app-root') || document.body;
    const originalContent = root.innerHTML;
    const shell = document.createElement('div');
    shell.className = 'app';
    shell.innerHTML = `
      <div class="aurora"></div>
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
              ${i.badge ? `<span class="nav-badge">${i.badge}</span>` : ''}
            </a>
          `).join('')}
        `).join('')}

        <div class="sidebar-foot">
          <div class="user-chip" id="userChip" tabindex="0" aria-haspopup="menu">
            <div class="avatar">${initials(name, user.email)}</div>
            <div class="meta">
              <div class="name">${escapeHtml(name)}</div>
              <div class="plan">${escapeHtml(plan)}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
      </aside>

      <main class="main">
        <div class="topbar">
          <button class="mobile-menu-btn" id="menuBtn" aria-label="Open menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <div class="topbar-title">${escapeHtml(title || pageLabel(active))}</div>
          <span class="topbar-sep">·</span>
          <div class="text-tertiary text-xs mono">${escapeHtml(meta.brand_name || name)}</div>
          <div class="topbar-spacer"></div>

          <div class="search-box">
            ${iconSearch()}
            <input id="globalSearch" placeholder="Search insights, channels, settings…" />
            <span class="kbd">⌘K</span>
          </div>

          <div class="relative" id="bellWrap">
            <button class="bell" id="bellBtn" aria-label="Notifications">
              ${iconBell()}
              <span class="bell-dot" id="bellDot"></span>
            </button>
          </div>
        </div>
        <div id="appContent">${originalContent}</div>
      </main>
    `;

    root.innerHTML = '';
    root.appendChild(shell);

    // Mobile drawer
    const sidebar = document.getElementById('sidebar');
    document.getElementById('menuBtn')?.addEventListener('click', () => {
      sidebar.classList.add('open');
      const bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.onclick = () => { sidebar.classList.remove('open'); bd.remove(); };
      document.body.appendChild(bd);
    });

    // User dropdown
    const chip = document.getElementById('userChip');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = document.getElementById('userMenu');
      if (existing) { existing.remove(); return; }
      const menu = document.createElement('div');
      menu.id = 'userMenu';
      menu.className = 'user-menu';
      menu.innerHTML = `
        <a href="/profile">${iconUser()}<span>Profile</span></a>
        <a href="/settings">${iconCog()}<span>Settings</span></a>
        <a href="/pricing">${iconSpark()}<span>Plans &amp; Billing</span></a>
        <div class="sep"></div>
        <button id="signOutBtn">${iconLogout()}<span>Sign out</span></button>
      `;
      chip.appendChild(menu);
      document.getElementById('signOutBtn').addEventListener('click', async () => {
        await window.HelmSupabase.signOut();
      });
      const close = (evt) => { if (!menu.contains(evt.target) && evt.target !== chip) { menu.remove(); document.removeEventListener('click', close); } };
      setTimeout(() => document.addEventListener('click', close), 0);
    });

    // Notifications
    if (window.HelmNotif) {
      await window.HelmNotif.attach(document.getElementById('bellWrap'), user, plan);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('globalSearch')?.focus();
      }
    });

    return { user, plan };
  }

  function pageLabel(path) {
    return ({
      '/dashboard':   'Dashboard',
      '/insights':    'AI Insights',
      '/reports':     'Reports',
      '/onboarding':  'Integrations',
      '/profile':     'Profile',
      '/settings':    'Settings',
      '/pricing':     'Plans & Billing',
    })[path] || 'HELM';
  }

  async function loadPlan(user) {
    try {
      const sb = await window.HelmSupabase.getClient();
      const { data } = await sb.from('subscriptions').select().eq('user_id', user.id).limit(1);
      if (data && data[0]) return planLabel(data[0].plan, data[0].status);
    } catch (_) {}
    return 'Free Trial · 13d left';
  }
  function planLabel(plan, status) {
    const map = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };
    const base = map[plan] || 'Free Trial';
    if (status === 'trialing') return base + ' · Trial';
    return base;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  window.HelmShell = { mount };
})();
