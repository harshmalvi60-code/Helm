// HELM — notifications dropdown.
// Reads/writes via Supabase. Notifications are inserted by real events
// only — Shopify connect, AI insight runs, alert detections. There is
// no seeded / mock content in production.

(function () {
  'use strict';

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

  // Insert a notification only when a real event fires. Idempotent
  // via the optional dedupe_key so we don't double-insert from re-renders.
  async function emit(userId, { severity = 'info', kind = null, title, body = null, dedupeKey = null } = {}) {
    if (!title) return;
    const sb = await window.HelmSupabase.getClient();
    if (dedupeKey) {
      const { data: existing } = await sb.from('notifications')
        .select().eq('user_id', userId).eq('kind', kind).limit(1);
      if (existing && existing.some((n) => n.metadata?.dedupe_key === dedupeKey)) return;
    }
    await sb.from('notifications').insert({
      user_id: userId,
      severity, kind, title, body,
      read: false,
      metadata: dedupeKey ? { dedupe_key: dedupeKey } : {},
    });
  }

  async function attach(wrapEl, user) {
    if (!wrapEl) return;

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

  window.HelmNotif = { attach, list, markAllRead, emit };
})();
