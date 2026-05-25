/**
 * Minimal client for the control-plane API (admin.perum.*), separate from the
 * school app's apiClient/AuthContext. Same-origin /api → Caddy → perum_core.
 */
const TOKEN_KEY = "auth_token";

export function getPlatformToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setPlatformToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearPlatformToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

/** Декодирует payload JWT (без проверки подписи — только для UX-роутинга). */
export function getTokenPayload(): Record<string, any> | null {
  const t = getPlatformToken();
  if (!t) return null;
  try {
    let p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    p += "=".repeat((4 - (p.length % 4)) % 4);
    return JSON.parse(atob(p));
  } catch {
    return null;
  }
}

export async function papi(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  const token = getPlatformToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err: any = new Error(
      data && typeof data === "object" && data.detail ? String(data.detail) : `HTTP ${res.status}`,
    );
    err.status = res.status;
    throw err;
  }
  return data;
}
