export type LinkTarget = { schoolPublicId: string; target: 'home' | 'messages' | 'support' };

export function parsePerumLink(value: string, linkHost: string): LinkTarget | null {
  try {
    const url = new URL(value);
    const allowed = url.protocol === 'perum:' || (url.protocol === 'https:' && url.hostname === linkHost);
    if (!allowed || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol === 'perum:' && url.hostname === 's') parts.unshift('s');
    if (parts.length < 2 || parts[0] !== 's' || !/^[0-9a-f-]{36}$/i.test(parts[1])) return null;
    const target = parts[2] ?? 'home';
    if (!['home', 'messages', 'support'].includes(target) || parts.length > 3) return null;
    return { schoolPublicId: parts[1].toLowerCase(), target: target as LinkTarget['target'] };
  } catch { return null; }
}

export function targetRoute(target: LinkTarget['target'], role: string) {
  if (target === 'messages') return role === 'student' ? '/(student)/messages' : null;
  if (target === 'support') return ['student', 'parent', 'teacher'].includes(role) ? '/support' : null;
  return '/';
}
