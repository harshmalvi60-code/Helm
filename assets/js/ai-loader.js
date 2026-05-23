// HELM — AI analysis loading sequence.
// Renders a multi-step progress indicator that animates through realistic
// "what the AI is doing" steps. Pure DOM + CSS, no backend.

(function () {
  'use strict';

  const STEPS = [
    { label: 'Connecting to your data sources',         ms: 600,  detail: 'shopify · meta · ga4 · klaviyo' },
    { label: 'Ingesting orders, sessions and ad spend', ms: 800,  detail: 'reading 30 days · 1,284 orders' },
    { label: 'Detecting ROAS anomalies by channel',     ms: 900,  detail: 'compared against 90-day trend' },
    { label: 'Scoring creative fatigue on Meta ad sets', ms: 800, detail: 'frequency × CTR decay model' },
    { label: 'Mapping conversion funnel drop-offs',     ms: 700,  detail: 'session → checkout → purchase' },
    { label: 'Estimating revenue impact in INR',        ms: 700,  detail: 'monthly recoverable amount' },
    { label: 'Generating recommended actions',          ms: 700,  detail: 'prioritized by ROI × effort' },
  ];

  async function run(target, { onDone, totalMs } = {}) {
    target.innerHTML = `
      <div class="ai-loader">
        <div class="ai-orb"><div class="core"></div></div>
        <h3>Analyzing your stack…</h3>
        <div class="loading-current" id="ailCurrent">Initializing</div>
        <div class="ai-steps" id="ailSteps">
          ${STEPS.map((_, i) => `
            <div class="ai-step" data-i="${i}">
              <div class="step-icon"></div>
              <div class="step-body">
                <div>${STEPS[i].label}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const stepsEl = target.querySelectorAll('.ai-step');
    const currentEl = target.querySelector('#ailCurrent');

    const scale = totalMs ? totalMs / STEPS.reduce((s, x) => s + x.ms, 0) : 1;

    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      stepsEl[i].classList.add('active');
      currentEl.textContent = '$ ' + s.detail;
      await new Promise((r) => setTimeout(r, s.ms * scale));
      stepsEl[i].classList.remove('active');
      stepsEl[i].classList.add('done');
    }
    currentEl.textContent = '$ insights ready';
    await new Promise((r) => setTimeout(r, 250));
    if (onDone) await onDone();
  }

  window.HelmAILoader = { run };
})();
