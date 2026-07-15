export function GET() {
  const appId = process.env.PERUM_APPLE_APP_ID;
  return Response.json({ applinks: { apps: [], details: appId ? [{ appID: appId, paths: ['/s/*'] }] : [] } }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
