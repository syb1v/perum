export const queryKeys = {
  account: (accountId: string) => ['account', accountId] as const,
  me: (accountId: string) => [...queryKeys.account(accountId), 'user', 'me'] as const,
  preferences: (accountId: string) => [...queryKeys.account(accountId), 'user', 'preferences'] as const,
  conversations: (accountId: string) => [...queryKeys.account(accountId), 'conversations'] as const,
  conversation: (accountId: string, conversationId: number) => [...queryKeys.conversations(accountId), conversationId] as const,
  messages: (accountId: string, conversationId: number) => [...queryKeys.account(accountId), 'messages', conversationId] as const,
  unread: (accountId: string) => [...queryKeys.account(accountId), 'unread'] as const,
  supportTickets: (accountId: string) => [...queryKeys.account(accountId), 'support', 'tickets'] as const,
  supportTicket: (accountId: string, ticketId: string) => [...queryKeys.supportTickets(accountId), ticketId] as const,
  supportThread: (accountId: string, ticketId: string) => [...queryKeys.account(accountId), 'support', 'messages', ticketId] as const,
};
