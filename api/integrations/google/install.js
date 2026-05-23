// GET /api/integrations/google/install
// Kicks off Google OAuth for GA4 (+ optionally Google Ads).
// Pass ?adwords=1 to also request the Google Ads scope.

const { getUserFromRequest } = require('../../../lib/supabase');
const { sign, setStateCookie, originFrom } = require('../../../lib/oauth');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const ADWORDS_SCOPE = 'https://www.googleapis.com/auth/adwords';

module.exports = async (req, res) => {
  const user = await getUserFromRequest(req).catch(() => null);
  if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
  if (!CLIENT_ID) { res.redirect(302, '/onboarding?error=' + encodeURIComponent('Google is not configured (GOOGLE_CLIENT_ID missing)')); return; }

  const url = new URL(req.url, originFrom(req));
  const adwords = url.searchParams.get('adwords') === '1';
  const providerKey = adwords ? 'google-ads' : 'google';
  const scope = [ANALYTICS_SCOPE, ...(adwords ? [ADWORDS_SCOPE] : [])].join(' ');

  const state = sign({ uid: user.id, provider: providerKey });
  setStateCookie(res, state);

  const redirectUri = originFrom(req) + '/api/integrations/google/callback';
  const authorize = 'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    `&access_type=offline&prompt=consent&include_granted_scopes=true`;
  res.redirect(302, authorize);
};
