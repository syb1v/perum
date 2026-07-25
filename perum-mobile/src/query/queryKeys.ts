export const queryKeys = {
  account: (accountId: string) => ['account', accountId] as const,
  me: (accountId: string) => [...queryKeys.account(accountId), 'user', 'me'] as const,
  preferences: (accountId: string) => [...queryKeys.account(accountId), 'user', 'preferences'] as const,
  conversations: (accountId: string) => [...queryKeys.account(accountId), 'conversations'] as const,
  conversation: (accountId: string, conversationId: number) => [...queryKeys.conversations(accountId), conversationId] as const,
  socialMessages: (accountId: string) => [...queryKeys.account(accountId), 'messages'] as const,
  messages: (accountId: string, conversationId: number) => [...queryKeys.account(accountId), 'messages', conversationId] as const,
  unread: (accountId: string) => [...queryKeys.account(accountId), 'unread'] as const,
  supportTickets: (accountId: string) => [...queryKeys.account(accountId), 'support', 'tickets'] as const,
  supportTicket: (accountId: string, ticketId: string) => [...queryKeys.supportTickets(accountId), ticketId] as const,
  supportThread: (accountId: string, ticketId: string) => [...queryKeys.account(accountId), 'support', 'messages', ticketId] as const,
  adminSupportTickets: (accountId: string) => [...queryKeys.account(accountId), 'support-admin', 'tickets'] as const,
  adminSupportTicket: (accountId: string, ticketId: string) => [...queryKeys.adminSupportTickets(accountId), ticketId] as const,
  adminSupportThread: (accountId: string, ticketId: string) => [...queryKeys.account(accountId), 'support-admin', 'messages', ticketId] as const,
  adminSupportUnread: (accountId: string) => [...queryKeys.account(accountId), 'support-admin', 'unread'] as const,
  adminSupportAssignees: (accountId: string) => [...queryKeys.account(accountId), 'support-admin', 'assignees'] as const,
  adminSupportEscalationDelivery: (accountId: string, ticketId: string) => [...queryKeys.account(accountId), 'support-admin', 'delivery', ticketId] as const,
  notifications: (accountId: string) => [...queryKeys.account(accountId), 'notifications'] as const,
  homework: (accountId: string) => [...queryKeys.account(accountId), 'homework'] as const,
  studentDiary: (accountId: string) => [...queryKeys.account(accountId), 'academics', 'diary'] as const,
  studentGrades: (accountId: string) => [...queryKeys.account(accountId), 'academics', 'grades'] as const,
  studentFinals: (accountId: string) => [...queryKeys.account(accountId), 'academics', 'finals'] as const,
  parentChildren: (accountId: string) => [...queryKeys.account(accountId), 'academics', 'children'] as const,
  parentDiary: (accountId: string, childId: number) => [...queryKeys.account(accountId), 'academics', 'child', childId, 'diary'] as const,
  parentGrades: (accountId: string, childId: number) => [...queryKeys.account(accountId), 'academics', 'child', childId, 'grades'] as const,
  parentFinals: (accountId: string, childId: number) => [...queryKeys.account(accountId), 'academics', 'child', childId, 'finals'] as const,
  teacherDiary: (accountId: string, weekOffset: number) => [...queryKeys.account(accountId), 'academics', 'teacher-diary', weekOffset] as const,
};

export const socialInvalidationKeys = {
  reconnect: (accountId: string) => [queryKeys.conversations(accountId), queryKeys.socialMessages(accountId), queryKeys.unread(accountId)] as const,
  messageCreated: (accountId: string, conversationId: number) => [queryKeys.conversations(accountId), queryKeys.conversation(accountId, conversationId), queryKeys.messages(accountId, conversationId), queryKeys.unread(accountId)] as const,
  messageSent: (accountId: string) => [queryKeys.conversations(accountId), queryKeys.socialMessages(accountId)] as const,
  conversationRead: (accountId: string, conversationId: number) => [queryKeys.conversations(accountId), queryKeys.conversation(accountId, conversationId), queryKeys.unread(accountId)] as const,
  conversationChanged: (accountId: string, conversationId: number) => [queryKeys.conversations(accountId), queryKeys.conversation(accountId, conversationId)] as const,
};

export const supportInvalidationKeys = {
  ticketCreated: (accountId: string) => [queryKeys.supportTickets(accountId)] as const,
  replySent: (accountId: string, ticketId: string) => [queryKeys.supportTickets(accountId), queryKeys.supportThread(accountId, ticketId)] as const,
  ticketRead: (accountId: string) => [queryKeys.supportTickets(accountId)] as const,
};

export const adminSupportInvalidationKeys = {
  ticketChanged: (accountId: string) => [queryKeys.adminSupportTickets(accountId), queryKeys.adminSupportUnread(accountId)] as const,
  replySent: (accountId: string, ticketId: string) => [queryKeys.adminSupportTickets(accountId), queryKeys.adminSupportThread(accountId, ticketId), queryKeys.adminSupportUnread(accountId)] as const,
  ticketRead: (accountId: string) => [queryKeys.adminSupportTickets(accountId), queryKeys.adminSupportUnread(accountId)] as const,
};
