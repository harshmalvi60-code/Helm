// GET /api/integrations/meta/callback?code=...&state=...
// Exchanges code → short-lived → long-lived access token, persists, and bounces back.

const { verify, readCookie, clearStateCookie, originFrom } = require('../../../lib/oauth');
const { upsertIntegration, logEvent } = require('../../../lib/supabase');

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;

module.exports = async (req, res) => {
  try {
    if (!APP_ID || !APP_SECRET) throw new Error('Meta env vars missing');

    const url = new URL(req.url, originFrom(req));
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = readCookie(req, 'helm_oauth_state');
    if (!state || state !== cookieState) throw new Error('State mismatch');
    const claims = verify(state);
    if (!claims || claims.provider !== 'meta') throw new Error('Invalid state');

    const redirectUri = originFrom(req) + '/api/integrations/meta/callback';

    // 1) short-lived
    const tRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${APP_SECRET}&code=${code}`);
    if (!tRes.ok) throw new Error('Short-lived token exchange failed');
    const tok = await tRes.json();

    // 2) long-lived (~60 days)
    const llRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tok.access_token}`);
    const ll = llRes.ok ? await llRes.json() : tok;

    // 3) pick the first ad account (best-effort)
    let accountId = null, accountLabel = null;
    try {
      const meRes = await fetch('https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name&limit=1', {
        headers: { Authorization: 'Bearer ' + ll.access_token },
      });
      const me = await meRes.json();
      accountId = me.data?.[0]?.id || null;
      accountLabel = me.data?.[0]?.name || null;
    } catch (_) {}

    await upsertIntegration(claims.uid, 'meta', {
      status: 'connected',
      account_id: accountId,
      account_label: accountLabel,
      scopes: (process.env.META_SCOPES || 'ads_read'),
      access_token: ll.access_token,
      token_expires_at: ll.expires_in ? new Date(Date.now() + ll.expires_in * 1000).toISOString() : null,
      connected_at: new Date().toISOString(),
    });
    await logEvent(claims.uid, 'integration_connected', { provider: 'meta', accountId });

    clearStateCookie(res);
    res.redirect(302, '/onboarding?connected=meta');
  } catch (e) {
    console.error('meta/callback error', e);
    clearStateCookie(res);
    res.redirect(302, '/onboarding?error=' + encodeURIComponent(e.message));
  }
};
