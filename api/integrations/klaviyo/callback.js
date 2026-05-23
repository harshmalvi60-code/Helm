// GET /api/integrations/klaviyo/callback?code=&state=

const { verify, readCookie, clearStateCookie, originFrom } = require('../../../lib/oauth');
const { upsertIntegration, logEvent } = require('../../../lib/supabase');

const CLIENT_ID = process.env.KLAVIYO_CLIENT_ID;
const CLIENT_SECRET = process.env.KLAVIYO_CLIENT_SECRET;

module.exports = async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Klaviyo env vars missing');
    const url = new URL(req.url, originFrom(req));
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = readCookie(req, 'helm_oauth_state');
    if (!state || state !== cookieState) throw new Error('State mismatch');
    const claims = verify(state);
    if (!claims || claims.provider !== 'klaviyo') throw new Error('Invalid state');

    const redirectUri = originFrom(req) + '/api/integrations/klaviyo/callback';
    const tRes = await fetch('https://a.klaviyo.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code, redirect_uri: redirectUri,
        code_verifier: claims.v,
      }).toString(),
    });
    if (!tRes.ok) throw new Error('Token exchange failed: ' + (await tRes.text()));
    const tok = await tRes.json();

    await upsertIntegration(claims.uid, 'klaviyo', {
      status: 'connected',
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      token_expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
      connected_at: new Date().toISOString(),
    });
    await logEvent(claims.uid, 'integration_connected', { provider: 'klaviyo' });

    clearStateCookie(res);
    res.redirect(302, '/onboarding?connected=klaviyo');
  } catch (e) {
    console.error('klaviyo/callback error', e);
    clearStateCookie(res);
    res.redirect(302, '/onboarding?error=' + encodeURIComponent(e.message));
  }
};
