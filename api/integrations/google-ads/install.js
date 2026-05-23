// Google Ads shares the same OAuth flow as GA4 — we just request an extra scope.
module.exports = (req, res) => {
  res.redirect(302, '/api/integrations/google/install?adwords=1');
};
