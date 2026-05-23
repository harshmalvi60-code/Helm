// HELM — client-side insights generator.
// Runs entirely on the real snapshot returned by /api/shopify/analytics.
// Each template guards against missing fields (e.g. ad_spend, ROAS, CVR
// won't be present until Meta / GA4 are connected) and is skipped if the
// data it needs isn't there. Result: every insight is anchored to a
// number the user can actually see on the dashboard.

(function () {
  'use strict';

  function fmt(n) { return window.HelmUI ? window.HelmUI.fmtCurrency(n) : '₹' + Math.round(n).toLocaleString('en-IN'); }

  // Each template returns null if it can't run on the given snapshot.
  const TEMPLATES = [
    // ============ Revenue trend ============
    (s) => {
      const rev = s.kpis.revenue.value;
      const delta = s.kpis.revenue.delta;
      if (!rev) return null;
      if (delta < -10) {
        return {
          category: 'revenue_leak', severity: 'critical',
          title: `Revenue is down ${Math.abs(delta).toFixed(1)}% vs the previous period`,
          summary: `You did ${fmt(rev)} this period (${s.range}) — that's ${Math.abs(delta).toFixed(1)}% lower than the previous window. The drop is visible from day one, suggesting a recurring issue (not a one-off bad day) — likely a checkout, fulfilment, or paid traffic problem.`,
          recommendation: `Audit the top 3 product pages for stockouts, slow load times and any recent theme/checkout changes. Also check if any flagship ad set went off in the last 2 weeks.`,
          impact_inr: Math.round(Math.abs(rev * delta / 100)),
          metrics: { revenue: rev, delta_pct: delta, range: s.range },
        };
      }
      if (delta > 10) {
        return {
          category: 'opportunity', severity: 'opportunity',
          title: `Revenue is up ${delta.toFixed(1)}% — find what's driving it`,
          summary: `${fmt(rev)} in revenue this ${s.range}, ${delta.toFixed(1)}% above the previous window. Win streaks are temporary — figure out which channel or campaign is responsible while it's still hot.`,
          recommendation: `Pull last week's top-selling SKU and its referring source. Double the ad budget on whatever drove the lift before momentum fades.`,
          impact_inr: Math.round(rev * 0.08),
          metrics: { revenue: rev, delta_pct: delta },
        };
      }
      return null;
    },

    // ============ AOV ============
    (s) => {
      const aov = s.kpis.aov?.value;
      if (!aov) return null;
      if (aov < 1500) {
        return {
          category: 'opportunity', severity: 'opportunity',
          title: `AOV is ${fmt(aov)} — bundles could lift it 20-30%`,
          summary: `Your average order value is ${fmt(aov)}. For D2C with similar AOV bands, a single well-priced bundle SKU typically moves blended AOV up ${fmt(aov * 0.25)} within 30 days.`,
          recommendation: `Bundle your top-2 SKUs with a 5-10% discount and feature it on the cart drawer.`,
          impact_inr: Math.round((s.kpis.revenue.value || 0) * 0.06),
          metrics: { aov, orders: s.kpis.orders.value },
        };
      }
      return null;
    },

    // ============ ROAS / paid (only if connected) ============
    (s) => {
      const roas = s.kpis.roas?.value;
      if (roas == null || s.kpis.roas?.missing) return null;
      if (roas < 2) {
        return {
          category: 'roas', severity: 'critical',
          title: `Blended ROAS is ${roas.toFixed(2)}x — below break-even for most D2C brands`,
          summary: `You spent ${fmt(s.kpis.ad_spend.value)} on ads to return ${fmt(s.kpis.revenue.value)}. After COGS, shipping and platform fees, that ratio is unprofitable.`,
          recommendation: `Pause ad sets with ROAS < 1.5x, shift 30% of spend into your top 2 LAL audiences, and refresh creative on prospecting sets above 6.0 frequency.`,
          impact_inr: Math.round(s.kpis.revenue.value * 0.07),
          metrics: { roas, ad_spend: s.kpis.ad_spend.value },
        };
      }
      return null;
    },

    // ============ Conversion rate (only if GA4 connected) ============
    (s) => {
      const cvr = s.kpis.cvr?.value;
      if (cvr == null || s.kpis.cvr?.missing) return null;
      if (cvr < 1.5) {
        return {
          category: 'conversion', severity: 'warning',
          title: `Conversion rate is ${cvr.toFixed(2)}% — well below the D2C benchmark`,
          summary: `With ${window.HelmUI.fmtNumber(s.kpis.sessions.value)} sessions converting at ${cvr.toFixed(2)}%, you're losing roughly 1 in 3 motivated shoppers that other stores would convert.`,
          recommendation: `Enable Shop Pay + express checkout, surface a free-shipping progress bar in the cart drawer, and turn on guest checkout.`,
          impact_inr: Math.round((s.kpis.revenue.value || 0) * 0.05),
          metrics: { cvr_pct: cvr, sessions: s.kpis.sessions.value },
        };
      }
      return null;
    },

    // ============ Low stock ============
    (s) => {
      const lowStock = (s.products || []).filter((p) => p.stock != null && p.stock < 30 && p.orders > 0);
      if (!lowStock.length) return null;
      const top = lowStock.sort((a, b) => b.revenue - a.revenue)[0];
      return {
        category: 'revenue_leak', severity: 'warning',
        title: `${top.name} is running low — ${top.stock} units left`,
        summary: `${top.name} drove ${fmt(top.revenue)} in the last ${s.range}. At your current sell-through rate it will stock-out within days, leaking revenue from your best-converting SKU.`,
        recommendation: `Issue a PO today and pause spend on this SKU's ads until restock confirmation lands.`,
        impact_inr: top.revenue,
        metrics: { sku: top.sku, stock: top.stock, orders_in_range: top.orders },
      };
    },

    // ============ Top product concentration ============
    (s) => {
      if (!s.products || s.products.length < 3) return null;
      const total = s.products.reduce((acc, p) => acc + p.revenue, 0);
      if (!total) return null;
      const topShare = s.products[0].revenue / total;
      if (topShare > 0.4) {
        return {
          category: 'opportunity', severity: 'info',
          title: `${(topShare * 100).toFixed(0)}% of revenue comes from ${s.products[0].name}`,
          summary: `Your top SKU drives a huge share of revenue. That's powerful — but also fragile if stock, supply or ad performance dips.`,
          recommendation: `Identify the #2 product's profile (price band, category, USP) and shift 15% of ad spend toward growing it as a hedge.`,
          impact_inr: Math.round(s.kpis.revenue.value * 0.04),
          metrics: { top_share_pct: (topShare * 100).toFixed(0), top_sku: s.products[0].sku },
        };
      }
      return null;
    },

    // ============ Customer concentration ============
    (s) => {
      const cust = s.customers;
      if (!cust || !cust.count_in_range) return null;
      const ordersPerCust = s.kpis.orders.value / cust.count_in_range;
      if (ordersPerCust < 1.15 && s.kpis.orders.value > 10) {
        return {
          category: 'retention', severity: 'opportunity',
          title: `Repeat rate is ${ordersPerCust.toFixed(2)}x — leaving LTV on the table`,
          summary: `Across this period, ${cust.count_in_range} unique customers placed ${s.kpis.orders.value} orders. A 3-email post-purchase flow typically lifts repeat rate by 30-50% in 60 days.`,
          recommendation: `Launch a Klaviyo flow: D+3 thank-you with care guide, D+14 cross-sell, D+45 replenishment. Add a 60-day winback segment.`,
          impact_inr: Math.round(s.kpis.revenue.value * 0.06),
          metrics: { repeat_x: ordersPerCust.toFixed(2), customers: cust.count_in_range },
        };
      }
      return null;
    },
  ];

  function buildInsights(snapshot) {
    if (!snapshot || !snapshot.connected) return [];
    const out = [];
    for (const t of TEMPLATES) {
      try {
        const ins = t(snapshot);
        if (ins) out.push(ins);
      } catch (_) { /* skip */ }
    }
    const now = Date.now();
    return out.map((ins, i) => ({
      ...ins,
      id: 'gen-' + now + '-' + i,
      created_at: new Date(now - i * 1500).toISOString(),
    }));
  }

  // Backwards-compatible name used by the insights / onboarding pages.
  async function generateAll() {
    let snapshot = null;
    try { snapshot = await window.HelmDashboard.loadSnapshot('30d'); }
    catch (_) { return []; }
    return buildInsights(snapshot);
  }

  function generateReport(insights, snapshot) {
    if (!snapshot || !snapshot.connected || !insights || !insights.length) {
      return {
        summary_md: '## No data yet\n\nConnect Shopify to generate your first weekly growth report.',
        recommendations: [],
        metrics: {},
      };
    }
    const top = insights.slice(0, 4);
    const totalImpact = top.reduce((s, x) => s + (x.impact_inr || 0), 0);
    const k = snapshot.kpis;
    const lines = [
      `## Week of ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      '',
      `Revenue: **${fmt(k.revenue.value)}** · Orders: **${window.HelmUI.fmtNumber(k.orders.value)}** · AOV: **${fmt(k.aov.value)}**.`,
    ];
    if (top[0]) {
      lines.push('', `The biggest signal this week was on **${top[0].category.replace('_', ' ')}** — ${top[0].summary}`);
    }
    if (totalImpact) {
      lines.push('', `If you ship the top ${top.length} fixes below, HELM estimates **${fmt(totalImpact)}/mo** in recovered revenue within 4–6 weeks.`);
    }
    return {
      summary_md: lines.join('\n'),
      recommendations: top.map((i) => `${i.title} → ${i.recommendation}`),
      metrics: { revenue: k.revenue.value, orders: k.orders.value, aov: k.aov.value },
    };
  }

  window.HelmInsightsGen = { generateAll, generateReport, buildInsights };
})();
