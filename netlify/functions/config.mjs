export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return Response.json({ configured: false });
  }

  return Response.json({
    configured: true,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabasePublishableKey,
  }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
};
