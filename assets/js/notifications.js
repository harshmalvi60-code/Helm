// HELM — notifications dropdown.
// Seeds realistic alerts on first load (per user) so the bell always
// has something believable in it. Reads/writes via the Supabase client
// (real or demo stub) so it carries through to production seamlessly.

(function () {
  'use strict';

  const SEED = [
    { severity: 'critical', kind: 'roas',
      title: 'Meta ROAS dropped to 1.84x',
      body: 'Down from 2.6x last week — concentrated in Prospecting · LAL 5%.',
      ago_min: 12 },
    { severity: 'warning', kind: 'fatigue',
      title: 'Creative fatigue on 2 top ads',
      body: 'Frequency crossed 5.0 — CTR halved in the last 7 days.',
      ago_min: 48 },
    { severity: 'success', kind: 'opportunity',
      title: 'Klaviyo flow lifted by 24%',
      body: '"Browse abandonment" flow had its best week — keep it running.',
      ago_min: 220 },
    { severity: 'info', kind: 'sync',
      title: 'Shopify sync complete',
      body: '1,284 orders ingested from the last 30 days.',
      ago_min: 360, read: true },
    { severity: 'warning', kind: 'cvr',
      title: 'Mobile CVR dipped under 1.5%',
      body: 'Desktop is converting at 2.4× mobile — likely PDP friction.',
      ago_min: 1300, read: true },
  ];

  async function ensureSeed(userId) {
    const sb = await window.HelmSupabase.getClient();
    const { data } = await sb.from('notifications').select().eq('user_id', userId).limit(1);
    if (data && data.length) return;
    const now = Date.now();
    for (const n of SEED) {
      await sb.from('notifications').insert({
        user_id: userId,
        severity: n.severity,
        kind: n.kind,
        title: n.title,
        body: n.body,
        read: !!n.read,
        created_at: new Date(now - n.ago_min * 60000).toISOString(),
      });
    }
  }

  async function list(userId, limit = 12) {
    const sb = await window.HelmSupabase.getClient();
    const { data } = await sb.from('notifications').select().eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    return data || [];
  }

  async function markAllRead(userId) {
    const sb = await window.HelmSupabase.getClient();
    const items = await list(userId, 99);
    for (const n of items) {
      if (!n.read) await sb.from('notifications').update({ read: true }).eq('id', n.id);
    }
  }

  async function attach(wrapEl, user) {
    if (!wrapEl) return;
    await ensureSeed(user.id);

    const updateDot = async () => {
      const items = await list(user.id);
      const unread = items.filter((n) => !n.read).length;
      const dot = wrapEl.querySelector('.bell-dot');
      if (dot) dot.style.display = unread > 0 ? '' : 'none';
    };
    await updateDot();

    const btn = wrapEl.querySelector('.bell');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const existing = wrapEl.querySelector('.notif-panel');
      if (existing) { existing.remove(); return; }

      const panel = document.createElement('div');
      panel.className = 'notif-panel';
      panel.innerHTML = `
        <div class="notif-panel-head">
          <h4>Notifications</h4>
          <button id="markAllBtn">Mark all read</button>
        </div>
        <div class="notif-list" id="notifList">
          <div style="padding:20px;text-align:center;"><span class="spinner"></span></div>
        </div>
        <div class="notif-panel-foot"><a href="/insights">View all in AI Insights →</a></div>
      `;
      wrapEl.appendChild(panel);

      const items = await list(user.id);
      const target = panel.querySelector('#notifList');
      if (!items.length) {
        target.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px;">You're all caught up.</div>`;
      } else {
        target.innerHTML = items.map(renderItem).join('');
      }

      panel.querySelector('#markAllBtn').addEventListener('click', async () => {
        await markAllRead(user.id);
        await updateDot();
        panel.querySelectorAll('.notif-item.unread').forEach((el) => el.classList.remove('unread'));
        window.HelmUI?.toast('All notifications marked read', 'success', 1400);
      });

      const close = (evt) => {
        if (!panel.contains(evt.target) && evt.target !== btn && !btn.contains(evt.target)) {
          panel.remove();
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    });
  }

  function renderItem(n) {
    const sev = n.severity || 'info';
    return `
      <div class="notif-item ${sev} ${n.read ? '' : 'unread'}" data-id="${n.id}">
        <div class="ni-icon">${iconFor(sev)}</div>
        <div class="ni-body">
          <div class="ni-title">${esc(n.title)}</div>
          <div class="text-sm text-muted">${esc(n.body || '')}</div>
          <div class="ni-meta mt-1">${window.HelmUI?.relativeTime(n.created_at) || ''}</div>
        </div>
      </div>
    `;
  }

  function iconFor(sev) {
    if (sev === 'critical') return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    if (sev === 'warning')  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    if (sev === 'success')  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  window.HelmNotif = { attach, list, markAllRead };
})();
