// HELM — dashboard data + chart rendering.
// Frontend-only MVP: snapshots are generated client-side from a
// deterministic daily seed so charts stay believable across refreshes.

(function () {
  'use strict';

  function ui() { return window.HelmUI; }

  async function loadSnapshot(range = '30d') {
    await new Promise((r) => setTimeout(r, 220));
    return generateLocalSnapshot(range);
  }

  function generateLocalSnapshot(range = '30d') {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const seed = Math.floor(Date.now() / 86400000);
    const r = mulberry32(seed);
    const series = [];
    const baseRev = 240000;
    const baseSpend = 60000;
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const wknd = [0, 6].includes(date.getDay()) ? 1.18 : 1;
      const trend = 1 + (days - i) * 0.003;
      const rev = baseRev * wknd * trend * (0.82 + r() * 0.38);
      const spend = baseSpend * trend * (0.88 + r() * 0.28);
      const sessions = Math.round(rev / (180 + r() * 60));
      const orders = Math.round(rev / (2200 + r() * 400));
      series.push({
        date: date.toISOString().slice(0, 10),
        revenue: Math.round(rev),
        spend: Math.round(spend),
        roas: +(rev / spend).toFixed(2),
        sessions, orders,
        cvr: +((orders / sessions) * 100).toFixed(2),
        aov: Math.round(rev / orders),
      });
    }

    const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
    const totalRev = sum(series, 'revenue');
    const totalSpend = sum(series, 'spend');
    const totalSessions = sum(series, 'sessions');
    const totalOrders = sum(series, 'orders');

    const half = Math.floor(series.length / 2);
    const recent = series.slice(half);
    const prior  = series.slice(0, half);
    const sumOver = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
    const dRev   = pct(sumOver(recent, 'revenue') * 2, sumOver(prior, 'revenue') * 2);
    const dSp    = pct(sumOver(recent, 'spend') * 2, sumOver(prior, 'spend') * 2);
    const dSess  = pct(sumOver(recent, 'sessions') * 2, sumOver(prior, 'sessions') * 2);
    const dOrd   = pct(sumOver(recent, 'orders') * 2, sumOver(prior, 'orders') * 2);
    const rRoas  = sumOver(recent, 'revenue') / Math.max(sumOver(recent, 'spend'), 1);
    const pRoas  = sumOver(prior,  'revenue') / Math.max(sumOver(prior,  'spend'), 1);
    const dRoas  = pct(rRoas, pRoas);
    const rCvr   = (sumOver(recent, 'orders') / Math.max(sumOver(recent, 'sessions'), 1)) * 100;
    const pCvr   = (sumOver(prior,  'orders') / Math.max(sumOver(prior,  'sessions'), 1)) * 100;
    const dCvr   = pct(rCvr, pCvr);
    const dAov   = pct(sumOver(recent, 'revenue') / Math.max(sumOver(recent, 'orders'), 1),
                       sumOver(prior,  'revenue') / Math.max(sumOver(prior,  'orders'), 1));

    const channels = [
      { name: 'Meta Ads',    spend: totalSpend * 0.55, revenue: totalRev * 0.42, color: '#1877F2' },
      { name: 'Google Ads',  spend: totalSpend * 0.30, revenue: totalRev * 0.28, color: '#4285F4' },
      { name: 'Organic',     spend: 0,                 revenue: totalRev * 0.16, color: '#00FF88' },
      { name: 'Email / SMS', spend: totalSpend * 0.05, revenue: totalRev * 0.10, color: '#9D6BFF' },
      { name: 'Direct',      spend: 0,                 revenue: totalRev * 0.04, color: '#8A8A8A' },
    ].map((c) => ({ ...c, roas: c.spend > 0 ? +(c.revenue / c.spend).toFixed(2) : null }));

    const funnel = [
      { label: 'Sessions',         count: totalSessions },
      { label: 'Product views',    count: Math.round(totalSessions * 0.58) },
      { label: 'Add to cart',      count: Math.round(totalSessions * 0.18) },
      { label: 'Checkout started', count: Math.round(totalSessions * 0.064) },
      { label: 'Purchased',        count: totalOrders },
    ];

    const products = [
      { name: 'Single-Origin Espresso · 250g', sku: 'ESP-250', orders: Math.round(totalOrders * 0.18), revenue: Math.round(totalRev * 0.22), stock: 142 },
      { name: 'Filter Coffee Bundle',          sku: 'FCB-BND', orders: Math.round(totalOrders * 0.14), revenue: Math.round(totalRev * 0.17), stock:  46 },
      { name: 'Dark Roast · 500g',             sku: 'DKR-500', orders: Math.round(totalOrders * 0.12), revenue: Math.round(totalRev * 0.13), stock: 218 },
      { name: 'Decaf · 250g',                  sku: 'DCF-250', orders: Math.round(totalOrders * 0.08), revenue: Math.round(totalRev * 0.08), stock:  19 },
      { name: 'Subscription · Monthly',        sku: 'SUB-MTH', orders: Math.round(totalOrders * 0.07), revenue: Math.round(totalRev * 0.12), stock: null },
    ];

    return {
      generated_at: new Date().toISOString(),
      range,
      kpis: {
        revenue:  { value: totalRev,                                          delta: dRev,  sparkKey: 'revenue' },
        ad_spend: { value: totalSpend,                                        delta: dSp,   sparkKey: 'spend' },
        roas:     { value: +(totalRev / Math.max(totalSpend, 1)).toFixed(2),  delta: dRoas, sparkKey: 'roas' },
        orders:   { value: totalOrders,                                       delta: dOrd,  sparkKey: 'orders' },
        sessions: { value: totalSessions,                                     delta: dSess, sparkKey: 'sessions' },
        cvr:      { value: +((totalOrders / Math.max(totalSessions, 1)) * 100).toFixed(2), delta: dCvr, sparkKey: 'cvr' },
        aov:      { value: Math.round(totalRev / Math.max(totalOrders, 1)),   delta: dAov,  sparkKey: 'aov' },
        ltv:      { value: Math.round((totalRev / Math.max(totalOrders, 1)) * 1.6), delta: 4.2, sparkKey: 'cvr' },
      },
      series, channels, funnel, products,
      demo: true,
    };
  }

  function pct(curr, prev) {
    if (!prev || isNaN(prev)) return 0;
    return +(((curr - prev) / prev) * 100).toFixed(1);
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ============ KPI CARDS ============
  function renderKpis(snap) {
    const { fmtCurrency, fmtNumber } = ui();
    const cards = [
      { key: 'revenue',  label: 'Revenue',      icon: '₹', fmt: fmtCurrency, data: snap.kpis.revenue },
      { key: 'ad_spend', label: 'Ad Spend',     icon: '⚡', fmt: fmtCurrency, data: snap.kpis.ad_spend },
      { key: 'roas',     label: 'Blended ROAS', icon: '↗', fmt: (v) => v.toFixed(2) + 'x', data: snap.kpis.roas },
      { key: 'orders',   label: 'Orders',       icon: '#', fmt: fmtNumber, data: snap.kpis.orders },
    ];
    return cards.map((c) => kpiHtml(c, snap.series)).join('');
  }
  function renderKpiRow2(snap) {
    const { fmtCurrency, fmtNumber } = ui();
    const cards = [
      { key: 'sessions', label: 'Sessions',   icon: '◎', fmt: fmtNumber, data: snap.kpis.sessions },
      { key: 'cvr',      label: 'Conv. Rate', icon: '%', fmt: (v) => v.toFixed(2) + '%', data: snap.kpis.cvr },
      { key: 'aov',      label: 'AOV',        icon: '₹', fmt: fmtCurrency, data: snap.kpis.aov },
      { key: 'ltv',      label: 'Est. LTV',   icon: '★', fmt: fmtCurrency, data: snap.kpis.ltv },
    ];
    return cards.map((c) => kpiHtml(c, snap.series)).join('');
  }

  function kpiHtml({ key, label, icon, fmt, data }, series) {
    const d = ui().fmtDelta(data.delta);
    const sparkPts = series.map((s) => {
      if (key === 'revenue') return s.revenue;
      if (key === 'ad_spend') return s.spend;
      if (key === 'roas') return s.roas;
      if (key === 'orders') return s.orders;
      if (key === 'sessions') return s.sessions;
      if (key === 'cvr') return s.cvr;
      if (key === 'aov') return s.aov;
      return s.revenue;
    });
    const range = document.getElementById('rangeSel')?.value || '30d';
    return `
      <div class="kpi-card">
        <div class="kpi-head">
          <div class="kpi-label">${label}</div>
          <div class="kpi-icon"><span class="mono" style="font-size:12px;">${icon}</span></div>
        </div>
        <div class="kpi-value" data-countup="${data.value}" data-fmt="${key}">${fmt(data.value)}</div>
        <div class="kpi-delta ${d.cls}">${d.arrow} ${d.text} <span class="vs">vs last ${range}</span></div>
        <svg class="kpi-spark" viewBox="0 0 100 36" preserveAspectRatio="none">${sparkPath(sparkPts)}</svg>
      </div>
    `;
  }

  function sparkPath(values) {
    if (!values || values.length < 2) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 32 - ((v - min) / range) * 26;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const line = `M ${pts.join(' L ')}`;
    const area = `${line} L 100,36 L 0,36 Z`;
    return `
      <path d="${area}" fill="rgba(0,255,136,0.10)"/>
      <path d="${line}" fill="none" stroke="#00FF88" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
    `;
  }

  // ============ CHARTS ============
  function drawRevenueChart(canvas, series) {
    if (!window.Chart) return null;
    const labels = series.map((d) => d.date.slice(5));
    return new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: series.map((d) => d.revenue),
            borderColor: '#00FF88',
            backgroundColor: gradient(canvas, 'rgba(0,255,136,0.22)', 'rgba(0,255,136,0)'),
            fill: true, tension: 0.36,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
            pointHoverBackgroundColor: '#00FF88', pointHoverBorderColor: '#0A0D11', pointHoverBorderWidth: 2,
          },
          {
            label: 'Ad Spend',
            data: series.map((d) => d.spend),
            borderColor: '#9D6BFF',
            backgroundColor: 'rgba(157,107,255,0.06)',
            fill: false, tension: 0.36,
            borderWidth: 2, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 4,
          },
        ],
      },
      options: chartOpts({ currency: true }),
    });
  }
  function drawRoasChart(canvas, series) {
    if (!window.Chart) return null;
    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: series.map((d) => d.date.slice(5)),
        datasets: [{
          label: 'ROAS',
          data: series.map((d) => d.roas),
          borderColor: '#00FF88',
          backgroundColor: gradient(canvas, 'rgba(0,255,136,0.22)', 'rgba(0,255,136,0)'),
          fill: true, tension: 0.36,
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
          pointHoverBackgroundColor: '#00FF88', pointHoverBorderColor: '#0A0D11', pointHoverBorderWidth: 2,
        }],
      },
      options: chartOpts({ currency: false, suffix: 'x' }),
    });
  }
  function drawChannelChart(canvas, channels) {
    if (!window.Chart) return null;
    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: channels.map((c) => c.name),
        datasets: [{
          data: channels.map((c) => c.revenue),
          backgroundColor: channels.map((c) => c.color),
          borderWidth: 0, hoverOffset: 6,
        }],
      },
      options: {
        cutout: '68%',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#8B91A0', boxWidth: 8, padding: 12, font: { family: 'Inter', size: 12 }, usePointStyle: true, pointStyle: 'circle' },
          },
          tooltip: tooltipStyle(true),
        },
      },
    });
  }
  function gradient(canvas, top, bottom) {
    if (!canvas?.getContext) return top;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height || 280);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    return g;
  }
  function chartOpts({ currency, suffix }) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'end',
          labels: { color: '#8B91A0', boxWidth: 8, padding: 14, font: { family: 'Inter', size: 12 }, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: tooltipStyle(currency, suffix),
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#4F5663', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: {
          color: '#4F5663', font: { family: 'JetBrains Mono', size: 10 },
          callback: (v) => currency ? '₹' + (v / 1000).toFixed(0) + 'K' : v + (suffix || ''),
        } },
      },
    };
  }
  function tooltipStyle(currency, suffix) {
    return {
      backgroundColor: '#14171C',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
      titleFont: { family: 'Inter', size: 12, weight: '600' },
      bodyFont:  { family: 'JetBrains Mono', size: 12 },
      titleColor: '#F0F2F5',
      bodyColor: '#8B91A0',
      callbacks: {
        label: (ctx) => {
          const v = ctx.parsed.y ?? ctx.parsed;
          return ' ' + ctx.dataset.label + ': ' + (currency ? ui().fmtCurrency(v) : v + (suffix || ''));
        },
      },
    };
  }

  // ============ FUNNEL ============
  function renderFunnel(target, funnel) {
    const max = funnel[0].count;
    target.innerHTML = funnel.map((f, i) => {
      const wpct = (f.count / max) * 100;
      const dropoff = i > 0 ? (1 - f.count / funnel[i - 1].count) * 100 : 0;
      return `
        <div class="funnel-step" style="opacity:0;animation:fadeUp .35s ease ${i * 0.08}s forwards;">
          <div class="label">${f.label}</div>
          <div class="bar" style="width:${wpct.toFixed(1)}%">${ui().fmtNumber(f.count)}</div>
          <div class="pct ${i === 0 ? '' : 'drop'}">${i === 0 ? '100%' : '−' + dropoff.toFixed(1) + '%'}</div>
        </div>
      `;
    }).join('');
  }

  // ============ CHANNEL TABLE ============
  function renderChannelTable(target, channels) {
    target.innerHTML = `
      <table class="dtable">
        <thead>
          <tr>
            <th>Channel</th>
            <th class="num">Spend</th>
            <th class="num">Revenue</th>
            <th class="num">ROAS</th>
            <th class="num" style="width:80px;">Trend</th>
          </tr>
        </thead>
        <tbody>
          ${channels.map((c, i) => `
            <tr style="animation:fadeUp .35s ease ${i * 0.05}s backwards;">
              <td>
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:10px;vertical-align:middle;"></span>
                <span style="vertical-align:middle;font-weight:500;">${c.name}</span>
              </td>
              <td class="num">${ui().fmtCurrency(c.spend)}</td>
              <td class="num">${ui().fmtCurrency(c.revenue)}</td>
              <td class="num ${c.roas && c.roas >= 2.5 ? 'text-success' : c.roas && c.roas < 1.5 ? 'text-danger' : ''}">
                ${c.roas ? c.roas.toFixed(2) + 'x' : '—'}
              </td>
              <td class="num">
                <svg viewBox="0 0 60 20" width="60" height="20" style="vertical-align:middle;">${miniSpark(c)}</svg>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function miniSpark(channel) {
    const seed = channel.name.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const r = mulberry32(seed);
    const pts = [];
    for (let i = 0; i < 10; i++) pts.push(0.4 + r() * 0.6);
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 1;
    const coords = pts.map((v, i) => `${(i / 9 * 60).toFixed(1)},${(18 - (v - min) / range * 14).toFixed(1)}`);
    return `<polyline fill="none" stroke="${channel.color}" stroke-width="1.4" stroke-linejoin="round" points="${coords.join(' ')}"/>`;
  }

  // ============ PRODUCTS TABLE ============
  function renderProductTable(target, products) {
    target.innerHTML = `
      <table class="dtable">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th class="num">Orders</th>
            <th class="num">Revenue</th>
            <th class="num">Stock</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((p, i) => `
            <tr style="animation:fadeUp .35s ease ${i * 0.05}s backwards;">
              <td style="font-weight:500;">${p.name}</td>
              <td class="text-muted text-xs mono">${p.sku}</td>
              <td class="num">${ui().fmtNumber(p.orders)}</td>
              <td class="num">${ui().fmtCurrency(p.revenue)}</td>
              <td class="num ${p.stock != null && p.stock < 30 ? 'text-warning' : 'text-muted'}">${p.stock != null ? ui().fmtNumber(p.stock) : '∞'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // ============ COUNT-UP ============
  function countUpVisible() {
    document.querySelectorAll('[data-countup]').forEach((el) => {
      if (el.dataset.counted) return;
      el.dataset.counted = '1';
      const target = parseFloat(el.dataset.countup);
      const fmtKey = el.dataset.fmt;
      const start = performance.now();
      const duration = 800;
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        el.textContent = formatVal(target * ease(t), fmtKey);
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = formatVal(target, fmtKey);
      };
      requestAnimationFrame(step);
    });
  }
  function formatVal(v, key) {
    const u = ui();
    if (!u) return String(Math.round(v));
    if (key === 'revenue' || key === 'ad_spend' || key === 'aov' || key === 'ltv') return u.fmtCurrency(v);
    if (key === 'roas') return v.toFixed(2) + 'x';
    if (key === 'cvr') return v.toFixed(2) + '%';
    return u.fmtNumber(v);
  }

  window.HelmDashboard = {
    loadSnapshot,
    renderKpis,
    renderKpiRow2,
    drawRevenueChart,
    drawRoasChart,
    drawChannelChart,
    renderFunnel,
    renderChannelTable,
    renderProductTable,
    countUpVisible,
  };
})();
