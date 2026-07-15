import type { TenantRole } from './types';

export function routeForRole(role: TenantRole) {
  if (role === 'student') return '/(student)' as const;
  if (role === 'parent') return '/(parent)' as const;
  if (role === 'teacher') return '/(teacher)' as const;
  return '/(admin)' as const;
}
