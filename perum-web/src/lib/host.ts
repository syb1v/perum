/**
 * Host-based tenancy. One build serves every host:
 *   admin.perum.* → platform (control-plane UI)
 *   <slug>.perum.* → tenant (legacy school app)
 *
 * Pure (takes a hostname string) so it works both in middleware (request host)
 * and in the browser (window.location.hostname).
 */
export function isPlatformHostname(hostname: string): boolean {
  const h = (hostname || "").split(":")[0];
  return h === "admin.perum.local" || h.startsWith("admin.");
}

export function tenantSlug(hostname: string): string | null {
  const h = (hostname || "").split(":")[0];
  if (isPlatformHostname(h)) return null;
  return h.split(".")[0] || null;
}
