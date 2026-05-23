// GET /api/integrations/klaviyo/install
// Kicks off Klaviyo OAuth (PKCE-style).

const crypto = require('crypto');
const { getUserFromRequest } = require('../../../lib/supabase');
const { sign, setStateCookie, originFrom } = require('../../../lib/oauth');

const CLIENT_ID = process.env.KLAVIYO_CLIENT_ID;
const SCOPES = process.env.KLAVIYO_SCOPES || 'campaigns:read profiles:read metrics:read flows:read';

module.exports = async (req, res) => {
  const user = await getUserFromRequest(req).catch(() => null);
  if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
  if (!CLIENT_ID) { res.redirect(302, '/onboarding?error=' + encodeURIComponent('Klaviyo is not configured (KLAVIYO_CLIENT_ID missing)')); return; }

  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = sign({ uid: user.id, provider: 'klaviyo', v: verifier });
  setStateCookie(res, state);

  const redirectUri = originFrom(req) + '/api/integrations/klaviyo/callback';
  const authorize = 'https://www.klaviyo.com/oauth/authorize' +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256`;
  res.redirect(302, authorize);
};
