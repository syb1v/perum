import { parseRuntimeConfig } from './core';

export const runtimeConfig = parseRuntimeConfig({
  buildEnvironment: process.env.EXPO_PUBLIC_BUILD_ENV,
  coreApiUrl: process.env.EXPO_PUBLIC_CORE_API_URL,
  linkHost: process.env.EXPO_PUBLIC_LINK_HOST,
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
});
