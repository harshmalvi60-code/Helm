// HELM — tiny UI utilities shared across pages (toasts, formatters, fetch wrapper, animations)

(function () {
  'use strict';

  function ensureToastWrap() {
    let w = document.querySelector('.toast-wrap');
    if (!w) {
      w = document.createElement('div');
      w.className = 'toast-wrap';
      document.body.appendChild(w);
    }
    return w;
  }

  function toast(message, type = 'info', ms = 3200) {
    const w = ensureToastWrap();
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
    el.textContent = message;
    w.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 240);
    }, ms);
  }

  function fmtCurrency(n, ccy = 'INR') {
    if (n == null || isNaN(n)) return '—';
    if (ccy === 'INR') {
      const abs = Math.abs(n);
      if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
      if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
      if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
      return '₹' + Math.round(n).toLocaleString('en-IN');
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n);
  }

  function fmtNumber(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('en-IN');
  }

  function fmtPct(n, digits = 1) {
    if (n == null || isNaN(n)) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(digits) + '%';
  }

  function fmtDelta(deltaPct) {
    if (deltaPct == null || isNaN(deltaPct)) return { cls: 'flat', text: '—', arrow: '·' };
    if (Math.abs(deltaPct) < 0.05) return { cls: 'flat', text: '0.0%', arrow: '·' };
    return {
      cls: deltaPct > 0 ? 'up' : 'down',
      text: (deltaPct > 0 ? '+' : '') + deltaPct.toFixed(1) + '%',
      arrow: deltaPct > 0 ? '↑' : '↓',
    };
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  async function apiFetch(path, opts = {}) {
    const sb = await window.HelmSupabase.getClient();
    let token = null;
    try {
      const { data } = await sb.auth.getSession();
      token = data?.session?.access_token || null;
    } catch (_) {}
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch(path, { ...opts, headers, credentials: 'same-origin' });
    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) {
      const msg = (body && body.error) || (typeof body === 'string' ? body : r.statusText);
      throw new Error(msg || ('Request failed: ' + r.status));
    }
    return body;
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => toast('Copied to clipboard', 'success', 1600));
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setParam(name, value) {
    const url = new URL(window.location.href);
    if (value == null) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    history.replaceState({}, '', url);
  }

  window.HelmUI = { toast, fmtCurrency, fmtNumber, fmtPct, fmtDelta, relativeTime, apiFetch, debounce, copy, getParam, setParam };
})();
