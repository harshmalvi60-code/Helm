// GET /api/config — delivers public Supabase keys + capability flags
// to the browser so the user never has to hand-edit HTML files.
//
// Returns only PUBLIC values:
//   - supabaseUrl, supabaseAnonKey  (safe in browser; RLS gates rows)
//   - capability flags (which integrations are wired up server-side)
//
// SERVICE ROLE key is NEVER returned.

module.exports = (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const configured = Boolean(supabaseUrl && supabaseAnonKey && process.env.SUPABASE_SERVICE_ROLE_KEY);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.statusCode = 200;
  res.end(JSON.stringify({
    configured,
    supabaseUrl,
    supabaseAnonKey,
    providers: {
      shopify: Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
      meta:    Boolean(process.env.META_APP_ID),
      google:  Boolean(process.env.GOOGLE_CLIENT_ID),
      'google-ads': Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
      klaviyo: Boolean(process.env.KLAVIYO_CLIENT_ID),
    },
    missing: {
      SUPABASE_URL:               !process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY:          !process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY:  !process.env.SUPABASE_SERVICE_ROLE_KEY,
      SHOPIFY_CLIENT_ID:          !process.env.SHOPIFY_CLIENT_ID,
      SHOPIFY_CLIENT_SECRET:      !process.env.SHOPIFY_CLIENT_SECRET,
      HELM_OAUTH_SECRET:          !process.env.HELM_OAUTH_SECRET,
    },
  }));
};
