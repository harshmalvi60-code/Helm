// GET /api/integrations/meta/install
// Kicks off Meta (Facebook) OAuth so we can read ads_insights.

const { getUserFromRequest } = require('../../../lib/supabase');
const { sign, setStateCookie, originFrom } = require('../../../lib/oauth');

const APP_ID = process.env.META_APP_ID;
const SCOPES = process.env.META_SCOPES || 'ads_read,business_management,pages_read_engagement';

module.exports = async (req, res) => {
  const user = await getUserFromRequest(req).catch(() => null);
  if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
  if (!APP_ID) { res.redirect(302, '/onboarding?error=' + encodeURIComponent('Meta is not configured (META_APP_ID missing)')); return; }

  const state = sign({ uid: user.id, provider: 'meta' });
  setStateCookie(res, state);

  const redirectUri = originFrom(req) + '/api/integrations/meta/callback';
  const authorize = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(APP_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPES)}&state=${encodeURIComponent(state)}&response_type=code`;
  res.redirect(302, authorize);
};
