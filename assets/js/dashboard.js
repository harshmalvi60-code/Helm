// HELM — dashboard data + chart rendering.
// Real flow: GET /api/data/snapshot returns aggregated metrics.
// Demo flow: server returns synthesized but realistic numbers so the dashboard never looks empty.

(function () {
  'use strict';

  const { fmtCurrency, fmtNumber, fmtPct, fmtDelta, apiFetch, toast } = window.HelmUI;

  async function loadSnapshot(range = '30d') {
    try {
      return await apiFetch('/api/data/snapshot?range=' + encodeURIComponent(range));
    } catch (e) {
      console.warn('snapshot fetch failed, using local fallback', e);
      return generateLocalSnapshot(range);
    }
  }

  function generateLocalSnapshot(range = '30d') {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const seed = Math.floor(Date.now() / 86400000);
    const r = mulberry32(seed);
    const series = [];
    let baseRev = 240000;
    let baseSpend = 60000;
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const wknd = [0, 6].includes(date.getDay()) ? 1.15 : 1;
      const rev = baseRev * wknd * (0.85 + r() * 0.35);
      const spend = baseSpend * (0.9 + r() * 0.25);
      const sessions = Math.round(rev / (180 + r() * 60));
      const orders = Math.round(rev / (2200 + r() * 400));
      series.push({
        date: date.toISOString().slice(0, 10),
        revenue: Math.round(rev),
        spend: Math.round(spend),
        roas: Number((rev / spend).toFixed(2)),
        sessions, orders,
        cvr: Number(((orders / sessions) * 100).toFixed(2)),
        aov: Math.round(rev / orders),
      });
    }
    const totals = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
    const totalRev = totals(series, 'revenue');
    const totalSpend = totals(series, 'spend');
    const totalSessions = totals(series, 'sessions');
    const totalOrders = totals(series, 'orders');
    const prevTotalRev = totalRev * (0.85 + r() * 0.25);
    const prevSpend = totalSpend * (0.9 + r() * 0.2);
    const prevSessions = totalSessions * (0.92 + r() * 0.15);
    const prevOrders = totalOrders * (0.88 + r() * 0.18);

    const channels = [
      { name: 'Meta Ads', spend: totalSpend * 0.55, revenue: totalRev * 0.42, color: '#1877F2' },
      { name: 'Google Ads', spend: totalSpend * 0.30, revenue: totalRev * 0.28, color: '#4285F4' },
      { name: 'Organic', spend: 0, revenue: totalRev * 0.16, color: '#FF7A1A' },
      { name: 'Email / SMS', spend: totalSpend * 0.05, revenue: totalRev * 0.10, color: '#9D6BFF' },
      { name: 'Direct', spend: 0, revenue: totalRev * 0.04, color: '#8A8A8A' },
    ].map((c) => ({ ...c, roas: c.spend > 0 ? +(c.revenue / c.spend).toFixed(2) : null }));

    const funnel = [
      { label: 'Sessions',         count: totalSessions },
      { label: 'Product views',    count: Math.round(totalSessions * 0.58) },
      { label: 'Add to cart',      count: Math.round(totalSessions * 0.18) },
      { label: 'Checkout started', count: Math.round(totalSessions * 0.064) },
      { label: 'Purchased',        count: totalOrders },
    ];

    return {
      generated_at: new Date().toISOString(),
      range,
      kpis: {
        revenue:     { value: totalRev,     delta: pct(totalRev, prevTotalRev) },
        ad_spend:    { value: totalSpend,   delta: pct(totalSpend, prevSpend) },
        roas:        { value: +(totalRev / totalSpend).toFixed(2), delta: pct(totalRev / totalSpend, prevTotalRev / prevSpend) },
        orders:      { value: totalOrders,  delta: pct(totalOrders, prevOrders) },
        sessions:    { value: totalSessions, delta: pct(totalSessions, prevSessions) },
        cvr:         { value: +((totalOrders / totalSessions) * 100).toFixed(2), delta: pct(totalOrders / totalSessions, prevOrders / prevSessions) },
        aov:         { value: Math.round(totalRev / totalOrders), delta: pct(totalRev / totalOrders, prevTotalRev / prevOrders) },
        ltv:         { value: Math.round(totalRev / totalOrders * 1.6), delta: 4.2 },
      },
      series, channels, funnel,
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

  function renderKpis(kpis) {
    const card = (label, value, delta, fmt) => {
      const d = fmtDelta(delta);
      return `
        <div class="kpi-card">
          <div class="kpi-label">${label}</div>
          <div class="kpi-value">${fmt(value)}</div>
          <div class="kpi-delta ${d.cls}">${d.arrow} ${d.text} <span class="text-tertiary" style="font-weight:400;">vs prev</span></div>
        </div>
      `;
    };
    return [
      card('Revenue',  kpis.revenue.value,  kpis.revenue.delta,  (v) => fmtCurrency(v)),
      card('Ad Spend', kpis.ad_spend.value, kpis.ad_spend.delta, (v) => fmtCurrency(v)),
      card('ROAS',     kpis.roas.value,     kpis.roas.delta,     (v) => v.toFixed(2) + 'x'),
      card('Orders',   kpis.orders.value,   kpis.orders.delta,   (v) => fmtNumber(v)),
    ].join('');
  }

  function renderKpiRow2(kpis) {
    const card = (label, value, delta, fmt) => {
      const d = fmtDelta(delta);
      return `
        <div class="kpi-card">
          <div class="kpi-label">${label}</div>
          <div class="kpi-value">${fmt(value)}</div>
          <div class="kpi-delta ${d.cls}">${d.arrow} ${d.text}</div>
        </div>
      `;
    };
    return [
      card('Sessions',  kpis.sessions.value, kpis.sessions.delta, fmtNumber),
      card('Conv. Rate', kpis.cvr.value,     kpis.cvr.delta,      (v) => v.toFixed(2) + '%'),
      card('AOV',        kpis.aov.value,     kpis.aov.delta,      fmtCurrency),
      card('Est. LTV',   kpis.ltv.value,     kpis.ltv.delta,      fmtCurrency),
    ].join('');
  }

  function drawRevenueChart(ctx, series) {
    const labels = series.map((d) => d.date.slice(5));
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Revenue', data: series.map((d) => d.revenue), borderColor: '#FF7A1A',
            backgroundColor: 'rgba(255,122,26,0.10)', fill: true, tension: 0.32, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
          { label: 'Ad Spend', data: series.map((d) => d.spend), borderColor: '#9D6BFF',
            backgroundColor: 'rgba(157,107,255,0.06)', fill: false, tension: 0.32, borderWidth: 2, borderDash: [4, 4], pointRadius: 0 },
        ],
      },
      options: chartOpts({ currency: true }),
    });
  }

  function drawRoasChart(ctx, series) {
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: series.map((d) => d.date.slice(5)),
        datasets: [{
          label: 'ROAS',
          data: series.map((d) => d.roas),
          borderColor: '#FF7A1A',
          backgroundColor: 'rgba(255,122,26,0.12)',
          fill: true, tension: 0.32, borderWidth: 2, pointRadius: 0,
        }],
      },
      options: chartOpts({ currency: false, suffix: 'x' }),
    });
  }

  function drawChannelChart(ctx, channels) {
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: channels.map((c) => c.name),
        datasets: [{ data: channels.map((c) => c.revenue), backgroundColor: channels.map((c) => c.color), borderWidth: 0 }],
      },
      options: {
        cutout: '64%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#8A8A8A', boxWidth: 10, padding: 12, font: { family: 'Montserrat', size: 12 } } },
          tooltip: tooltipStyle(true),
        },
      },
    });
  }

  function renderFunnel(target, funnel) {
    const max = funnel[0].count;
    target.innerHTML = funnel.map((f, i) => {
      const pct = (f.count / max) * 100;
      const dropoff = i > 0 ? (1 - f.count / funnel[i - 1].count) * 100 : 0;
      return `
        <div class="funnel-step">
          <div class="label">${f.label}</div>
          <div class="bar" style="width:${pct.toFixed(1)}%">${fmtNumber(f.count)}</div>
          <div class="pct">${i === 0 ? '100%' : '−' + dropoff.toFixed(1) + '%'}</div>
        </div>
      `;
    }).join('');
  }

  function renderChannelTable(target, channels) {
    target.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;font-size:11px;">
            <th style="text-align:left;padding:8px 4px;">Channel</th>
            <th style="text-align:right;padding:8px 4px;">Spend</th>
            <th style="text-align:right;padding:8px 4px;">Revenue</th>
            <th style="text-align:right;padding:8px 4px;">ROAS</th>
          </tr>
        </thead>
        <tbody>
          ${channels.map((c) => `
            <tr style="border-top:1px solid var(--border);">
              <td style="padding:10px 4px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:8px;"></span>
                ${c.name}
              </td>
              <td style="text-align:right;padding:10px 4px;" class="mono">${fmtCurrency(c.spend)}</td>
              <td style="text-align:right;padding:10px 4px;" class="mono">${fmtCurrency(c.revenue)}</td>
              <td style="text-align:right;padding:10px 4px;" class="mono ${c.roas && c.roas > 2 ? 'text-success' : c.roas && c.roas < 1.5 ? 'text-danger' : ''}">
                ${c.roas ? c.roas.toFixed(2) + 'x' : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function chartOpts({ currency, suffix }) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'end',
          labels: { color: '#8A8A8A', boxWidth: 10, padding: 14, font: { family: 'Montserrat', size: 12 } } },
        tooltip: tooltipStyle(currency, suffix),
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A4A4A', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: {
          color: '#4A4A4A', font: { family: 'JetBrains Mono', size: 10 },
          callback: (v) => currency ? '₹' + (v / 1000).toFixed(0) + 'K' : v + (suffix || ''),
        } },
      },
    };
  }
  function tooltipStyle(currency, suffix) {
    return {
      backgroundColor: '#131313',
      borderColor: 'rgba(255,255,255,0.10)',
      borderWidth: 1,
      titleFont: { family: 'Montserrat', size: 12, weight: 600 },
      bodyFont: { family: 'JetBrains Mono', size: 12 },
      padding: 12,
      callbacks: {
        label: (ctx) => {
          const v = ctx.parsed.y ?? ctx.parsed;
          return ctx.dataset.label + ': ' + (currency ? window.HelmUI.fmtCurrency(v) : v + (suffix || ''));
        },
      },
    };
  }

  window.HelmDashboard = { loadSnapshot, renderKpis, renderKpiRow2, drawRevenueChart, drawRoasChart, drawChannelChart, renderFunnel, renderChannelTable };
})();
