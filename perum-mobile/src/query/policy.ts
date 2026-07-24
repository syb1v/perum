import type { Query } from '@tanstack/react-query';

const persistedScopes = new Set(['preferences', 'conversations', 'messages', 'unread', 'support', 'support-admin', 'notifications', 'homework']);

export function shouldPersistQuery(query: Query) {
  if (query.state.status !== 'success') return false;
  const key = query.queryKey;
  return key[0] === 'account' && typeof key[1] === 'string' && typeof key[2] === 'string' && persistedScopes.has(key[2]);
}
