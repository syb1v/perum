/**
 * Host-based tenancy. One build serves every host:
 *   perum.ru (apex) → лендинг ЯДРА (маркетинговая страница платформы)
 *   admin.perum.*   → platform (control-plane UI)
 *   <slug>.perum.*  → tenant (school app); custom-домен школы — тоже tenant
 *
 * Pure (takes a hostname string) so it works both in middleware (request host)
 * and in the browser (window.location.hostname).
 */

// Базовый домен платформы. Задаётся при сборке (NEXT_PUBLIC_BASE_DOMAIN, напр.
// avari-land.ru). Нужен, чтобы отличить АПЕКС ядра от кастомного домена школы
// (оба «двухуровневые» — по числу меток не различить).
const BASE_DOMAIN = (process.env.NEXT_PUBLIC_BASE_DOMAIN || "").split(":")[0].toLowerCase();

export function isPlatformHostname(hostname: string): boolean {
  const h = (hostname || "").split(":")[0];
  return h === "admin.perum.local" || h.startsWith("admin.");
}

/**
 * Апекс — корневой домен ЯДРА, единственное место лендинга. На школьных
 * поддоменах и кастомных доменах лендинга нет (там вход школы).
 */
export function isApexHostname(hostname: string): boolean {
  const h = (hostname || "").split(":")[0].toLowerCase();
  if (!h || isPlatformHostname(h)) return false;
  if (BASE_DOMAIN) return h === BASE_DOMAIN;
  // dev/fallback без NEXT_PUBLIC_BASE_DOMAIN: апекс = perum.local / localhost.
  return h === "perum.local" || h === "localhost";
}

export function tenantSlug(hostname: string): string | null {
  const h = (hostname || "").split(":")[0];
  if (isPlatformHostname(h) || isApexHostname(h)) return null;
  return h.split(".")[0] || null;
}
