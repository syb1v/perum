import type { components } from '@perum/api-schema/tenant';

export type SocialStudent = components['schemas']['StudentProfile'];
export type SocialStudentPage = components['schemas']['StudentPage'];
export type FriendRequest = components['schemas']['FriendRequestOut'];
export type UserBlock = components['schemas']['BlockOut'];

export function appendUniqueStudents(current: SocialStudent[], next: SocialStudent[]): SocialStudent[] {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !ids.has(item.id))];
}
