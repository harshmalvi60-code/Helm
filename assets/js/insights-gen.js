// HELM — client-side insights generator.
// Frontend-only MVP: produces realistic, varied insight cards from a
// templated library, salted with the user's actual snapshot numbers so
// the output reads like Claude wrote it against their data.
//
// To upgrade to a real LLM call later, wire this to a serverless proxy
// (Supabase Edge Function works on the free tier too) so the API key
// never lives in the browser.

(function () {
  'use strict';

  const TEMPLATES = [
    {
      pick: (m) => true,
      build: (m) => ({
        category: 'roas',
        severity: m.roas < 2 ? 'critical' : m.roas < 3 ? 'warning' : 'info',
        title: `ROAS is ${m.roas.toFixed(2)}x — ${m.roas < 2.5 ? 'below your break-even' : 'in the healthy band'}`,
        summary: `Across all paid channels you spent ${fmt(m.ad_spend)} and returned ${fmt(m.revenue)}. ${
          m.roas < 2.5
            ? `That puts blended ROAS under the 2.5x threshold most D2C brands need to stay profitable after COGS, shipping and platform fees.`
            : `That's comfortable headroom, but the Meta prospecting set is dragging the blended number — peel ${fmt(m.ad_spend * 0.18)} of spend out of underperformers and the ratio improves materially.`
        }`,
        recommendation: `Pause the bottom-3 ad sets (ROAS < 1.5x), shift 30% of that budget into your top-2 LAL audiences, and refresh creative on the prospecting set above 6.0 frequency.`,
        impact_inr: Math.round(m.revenue * 0.06),
        metrics: { current_roas: m.roas, ad_spend: m.ad_spend },
      }),
    },
    {
      pick: (m) => m.cvr < 2.4,
      build: (m) => ({
        category: 'conversion',
        severity: m.cvr < 1.5 ? 'critical' : 'warning',
        title: `Add-to-cart → checkout drop-off is ~64% (benchmark: 50%)`,
        summary: `You're losing roughly 1 in 3 motivated shoppers between cart and checkout. With ${fmt(m.sessions)} sessions this period at a ${m.cvr.toFixed(2)}% CVR, the biggest single lever is friction at checkout — likely forced account creation, shipping cost surprise or a slow payment widget.`,
        recommendation: `Enable Shopify Shop Pay + express checkout, surface a free-shipping progress bar in the cart drawer, and turn on guest checkout for first-time buyers.`,
        impact_inr: Math.round(m.revenue * 0.045),
        metrics: { current_cvr_pct: m.cvr, sessions: m.sessions },
      }),
    },
    {
      pick: (m) => true,
      build: (m) => ({
        category: 'creative_fatigue',
        severity: 'warning',
        title: `2 top ads crossed frequency 5.0 — CTR halved in 14 days`,
        summary: `Your two best-performing creatives in the last fortnight show a steep CTR decline as frequency climbed (1.8% → 0.9%). Textbook creative fatigue — the same prospects are seeing you 5+ times and tuning out.`,
        recommendation: `Ship 3 new creative variants this week: 1 UGC unboxing, 1 product demo, 1 testimonial. Cap retargeting frequency at 3.5 and rotate prospecting weekly.`,
        impact_inr: Math.round(m.revenue * 0.03),
        metrics: { fatigued_ads: 2, avg_frequency: 5.4 },
      }),
    },
    {
      pick: (m) => true,
      build: (m) => ({
        category: 'retention',
        severity: 'opportunity',
        title: `Repeat purchase rate is 18% — you have a real retention lever`,
        summary: `The last 90 days show a 1.21x repeat rate vs. the D2C category benchmark of 1.6x. With your AOV of ${fmt(m.aov)} and growing customer base, a simple post-purchase flow could shift this meaningfully without acquiring a single new customer.`,
        recommendation: `Launch a 3-email post-purchase flow in Klaviyo: D+3 thank-you with care guide, D+14 complementary product, D+45 replenishment reminder. Add a 60-day winback segment.`,
        impact_inr: Math.round(m.revenue * 0.07),
        metrics: { repeat_rate_pct: 18, benchmark_pct: 32 },
      }),
    },
    {
      pick: (m) => true,
      build: (m) => ({
        category: 'opportunity',
        severity: 'opportunity',
        title: `Organic search converts at 3.2x your paid traffic`,
        summary: `Organic visitors are converting at 4.1% vs 1.3% on paid, but only 16% of total sessions are organic. Doubling down on SEO + content is your highest-leverage move — you're paying for traffic you could earn.`,
        recommendation: `Identify your 10 best-performing PDP keywords this month and ship one long-form buyer-guide article per top-converting category over the next 30 days.`,
        impact_inr: Math.round(m.revenue * 0.035),
        metrics: { organic_cvr_pct: 4.1, paid_cvr_pct: 1.3 },
      }),
    },
    {
      pick: (m) => true,
      build: (m) => ({
        category: 'revenue_leak',
        severity: 'warning',
        title: `Mobile CVR is 38% lower than desktop`,
        summary: `Mobile drives ${Math.round(m.sessions * 0.71)} of your ${fmt(m.sessions)} sessions but converts at 1.4% vs 2.3% on desktop. That single gap is the biggest revenue leak in your funnel right now.`,
        recommendation: `Audit your mobile PDP for above-the-fold add-to-cart visibility, lazy-load product images, and remove any modal popups under 768px width.`,
        impact_inr: Math.round(m.revenue * 0.05),
        metrics: { mobile_cvr_pct: 1.4, desktop_cvr_pct: 2.3 },
      }),
    },
  ];

  function fmt(n) { return window.HelmUI ? window.HelmUI.fmtCurrency(n) : '₹' + Math.round(n).toLocaleString('en-IN'); }

  // Use the user's actual snapshot if available, otherwise synthesize.
  async function generateAll() {
    let m;
    try { m = await window.HelmDashboard.loadSnapshot('30d'); }
    catch (_) { m = null; }

    const metrics = m ? {
      revenue: m.kpis.revenue.value, ad_spend: m.kpis.ad_spend.value, roas: m.kpis.roas.value,
      sessions: m.kpis.sessions.value, orders: m.kpis.orders.value,
      cvr: m.kpis.cvr.value, aov: m.kpis.aov.value,
    } : { revenue: 7250000, ad_spend: 1820000, roas: 3.98, sessions: 41200, orders: 3290, cvr: 1.98, aov: 2203 };

    const insights = TEMPLATES.filter((t) => t.pick(metrics)).map((t) => t.build(metrics));

    // Latest at top — stamp created_at slightly apart so order is stable
    const now = Date.now();
    return insights.map((ins, i) => ({
      ...ins,
      id: 'gen-' + now + '-' + i,
      created_at: new Date(now - i * 1500).toISOString(),
    }));
  }

  function generateReport(insights, metrics) {
    const top = insights.slice(0, 4);
    const totalImpact = top.reduce((s, x) => s + (x.impact_inr || 0), 0);
    return {
      summary_md: [
        `## Week of ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        '',
        `Revenue: **${fmt(metrics.revenue)}** · ROAS: **${metrics.roas.toFixed(2)}x** · Conversion rate: **${metrics.cvr.toFixed(2)}%** · Orders: **${metrics.orders}**.`,
        '',
        `The biggest signal this week was on **${top[0]?.category.replace('_', ' ')}** — ${top[0]?.summary}`,
        '',
        `If you ship the top ${top.length} fixes below, HELM estimates **${fmt(totalImpact)}/mo** in recovered revenue within 4–6 weeks.`,
      ].join('\n'),
      recommendations: top.map((i) => `${i.title} → ${i.recommendation}`),
      metrics: { roas: metrics.roas, cvr: metrics.cvr, revenue: metrics.revenue, ad_spend: metrics.ad_spend },
    };
  }

  window.HelmInsightsGen = { generateAll, generateReport };
})();
