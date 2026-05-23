// HELM — Claude API helper.
// Direct HTTPS call to the Anthropic Messages API; no SDK.
// We default to Claude Sonnet 4.6 for cost/quality balance on insight generation.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

function hasClaude() { return Boolean(ANTHROPIC_API_KEY); }

async function generate({ system, prompt, json = false, maxTokens = 1800 }) {
  if (!hasClaude()) throw new Error('Claude not configured');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: system || 'You are HELM, a senior ecommerce growth analyst for D2C brands. You are blunt, evidence-driven, and always tie advice to revenue impact in INR.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Claude API ${r.status}: ${text}`);
  }
  const data = await r.json();
  const text = (data.content || []).map((b) => b.text || '').join('\n').trim();

  if (json) {
    const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    try { return JSON.parse(match ? match[1] || match[0] : text); }
    catch (e) { throw new Error('Claude returned invalid JSON: ' + text.slice(0, 300)); }
  }
  return text;
}

module.exports = { generate, hasClaude };
