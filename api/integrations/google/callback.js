// GET /api/integrations/google/callback?code=&state=
// Exchanges the code for tokens, stores them, and bounces back.

const { verify, readCookie, clearStateCookie, originFrom } = require('../../../lib/oauth');
const { upsertIntegration, logEvent } = require('../../../lib/supabase');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

module.exports = async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Google env vars missing');
    const url = new URL(req.url, originFrom(req));
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = readCookie(req, 'helm_oauth_state');
    if (!state || state !== cookieState) throw new Error('State mismatch');
    const claims = verify(state);
    if (!claims || (claims.provider !== 'google' && claims.provider !== 'google-ads')) throw new Error('Invalid state');

    const redirectUri = originFrom(req) + '/api/integrations/google/callback';
    const tRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        code, grant_type: 'authorization_code', redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tRes.ok) throw new Error('Token exchange failed: ' + (await tRes.text()));
    const tok = await tRes.json();

    // Identify the Google account email for the label
    let email = null;
    try {
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } });
      const j = await me.json();
      email = j.email || null;
    } catch (_) {}

    await upsertIntegration(claims.uid, claims.provider, {
      status: 'connected',
      account_label: email,
      scopes: tok.scope,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      token_expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
      connected_at: new Date().toISOString(),
    });
    await logEvent(claims.uid, 'integration_connected', { provider: claims.provider, email });

    clearStateCookie(res);
    res.redirect(302, '/onboarding?connected=' + claims.provider);
  } catch (e) {
    console.error('google/callback error', e);
    clearStateCookie(res);
    res.redirect(302, '/onboarding?error=' + encodeURIComponent(e.message));
  }
};
