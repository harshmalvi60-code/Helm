#!/usr/bin/env node
// One-command Supabase schema applier for HELM.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=abcdefg npm run setup
//
// Creates an access token here: https://supabase.com/dashboard/account/tokens
// Project ref is the subdomain of your Supabase URL: https://<ref>.supabase.co
//
// Reads supabase/schema.sql and executes it against the project via the
// Supabase Management API (https://api.supabase.com). Idempotent — safe
// to re-run any time the schema changes.

const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const c = (color, s) => `${COLORS[color]}${s}${COLORS.reset}`;

function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref   = process.env.SUPABASE_PROJECT_REF;

  if (!token || !ref) {
    console.log(c('red', '\n✗ Missing required env vars.\n'));
    console.log('Set the following before running ' + c('bold', 'npm run setup') + ':');
    console.log('  ' + c('cyan', 'SUPABASE_ACCESS_TOKEN') + '  →  https://supabase.com/dashboard/account/tokens');
    console.log('  ' + c('cyan', 'SUPABASE_PROJECT_REF') + '   →  the subdomain of your Supabase URL');
    console.log('\nYou can also put them in ' + c('bold', '.env.local') + ' and re-run.');
    console.log('\nAlternatively, paste ' + c('bold', 'supabase/schema.sql') + ' into the Supabase SQL Editor.');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log(c('cyan', '\n→ Applying HELM schema'));
  console.log(c('dim', '  project: ' + ref));
  console.log(c('dim', '  schema:  ' + path.relative(process.cwd(), schemaPath) + ' (' + sql.length + ' bytes)'));

  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await r.text();
  if (!r.ok) {
    console.log(c('red', '\n✗ Schema apply failed (' + r.status + ')'));
    console.log(c('dim', body.slice(0, 800)));
    process.exit(1);
  }

  console.log(c('green', '\n✓ Schema applied successfully'));

  // Quick sanity check — list tables to confirm
  try {
    const t = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "select table_name from information_schema.tables where table_schema='public' order by table_name" }),
    });
    if (t.ok) {
      const rows = await t.json();
      const names = (Array.isArray(rows) ? rows : []).map((r) => r.table_name);
      if (names.length) {
        console.log(c('cyan', '\n→ Tables in public schema:'));
        for (const n of names) console.log('  ' + c('green', '•') + ' ' + n);
      }
    }
  } catch (_) {}

  console.log(c('cyan', '\nNext:'));
  console.log('  1. Set SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in Vercel');
  console.log('  2. Set SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET + HELM_OAUTH_SECRET');
  console.log('  3. Redeploy. The /setup-required page will clear automatically.\n');
}

main().catch((e) => {
  console.error(c('red', '✗ Unexpected error: ') + e.message);
  process.exit(1);
});
