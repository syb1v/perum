export function GET() {
  const fingerprint = process.env.PERUM_ANDROID_SHA256_CERT_FINGERPRINT;
  const packageName = process.env.PERUM_ANDROID_PACKAGE || 'app.perum.mobile';
  return Response.json(fingerprint ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: [fingerprint] } }] : [], { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
