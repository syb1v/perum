export type SocialStudent = { id: number; name: string; avatar: string | null; class_name: string };
export type SocialStudentPage = { items: SocialStudent[]; next_cursor: number | null };
export type FriendRequest = { id: number; status: string; student: SocialStudent; created_at: string; expires_at: string };
export type UserBlock = { id: number; student: SocialStudent; reason_code: string | null; created_at: string };

export function appendUniqueStudents(current: SocialStudent[], next: SocialStudent[]): SocialStudent[] {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !ids.has(item.id))];
}
