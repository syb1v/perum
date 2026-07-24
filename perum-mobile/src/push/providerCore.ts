export type PushTokenProvider = {
  getToken: (projectId: string) => Promise<string>;
};

export async function acquirePushToken(provider: PushTokenProvider, projectId: string) {
  const token = (await provider.getToken(projectId)).trim();
  if (!token) throw new Error('Push provider returned an empty token');
  return token;
}
