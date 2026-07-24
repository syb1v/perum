function optional(value) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function parseRuntimeConfig(input) {
  const buildEnvironment = optional(input.buildEnvironment) ?? 'development';
  if (!['development', 'preview', 'production'].includes(buildEnvironment)) throw new Error('EXPO_PUBLIC_BUILD_ENV must be development, preview or production');

  const coreValue = optional(input.coreApiUrl) ?? (buildEnvironment === 'development' ? 'https://admin.perum.app/api' : undefined);
  if (!coreValue) throw new Error('EXPO_PUBLIC_CORE_API_URL is required');
  let core;
  try { core = new URL(coreValue); } catch { throw new Error('EXPO_PUBLIC_CORE_API_URL must be an absolute URL'); }
  const localDevelopment = buildEnvironment === 'development' && core.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(core.hostname);
  if (core.protocol !== 'https:' && !localDevelopment) throw new Error('EXPO_PUBLIC_CORE_API_URL must use HTTPS');
  if (core.username || core.password || core.search || core.hash) throw new Error('EXPO_PUBLIC_CORE_API_URL must not contain credentials, query or fragment');

  const linkValue = optional(input.linkHost) ?? (buildEnvironment === 'development' ? 'link.perum.app' : undefined);
  if (!linkValue) throw new Error('EXPO_PUBLIC_LINK_HOST is required');
  const linkHost = linkValue.toLowerCase();
  if (linkHost !== linkValue || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(linkHost)) throw new Error('EXPO_PUBLIC_LINK_HOST must be a lowercase DNS hostname');

  const projectId = optional(input.projectId) ?? null;
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) throw new Error('EXPO_PROJECT_ID must be a UUID');
  if (buildEnvironment !== 'development' && !projectId) throw new Error('EXPO_PROJECT_ID is required for preview and production');

  const pathname = core.pathname.replace(/\/+$/, '') || '/';
  return { buildEnvironment, coreApiUrl: `${core.origin}${pathname === '/' ? '' : pathname}`, linkHost, projectId };
}
