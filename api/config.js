// GET /api/config — exposes only the public Supabase URL + anon key to the browser.
// If env vars aren't set yet, returns demoMode:true so the UI uses the local stub client.

module.exports = (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const demoMode = !supabaseUrl || !supabaseAnonKey;

  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({
    supabaseUrl,
    supabaseAnonKey,
    demoMode,
    providers: {
      shopify: Boolean(process.env.SHOPIFY_CLIENT_ID),
      meta:    Boolean(process.env.META_APP_ID),
      google:  Boolean(process.env.GOOGLE_CLIENT_ID),
      'google-ads': Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
      klaviyo: Boolean(process.env.KLAVIYO_CLIENT_ID),
    },
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
  }));
};
