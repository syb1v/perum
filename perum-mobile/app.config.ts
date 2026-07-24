import type { ExpoConfig, ConfigContext } from "expo/config";

import baseConfig from "./app.json";
import { parseRuntimeConfig } from "./src/config/core";

export default ({ config }: ConfigContext): ExpoConfig => {
  const appConfig = baseConfig.expo as ExpoConfig;
  const runtime = parseRuntimeConfig({
    buildEnvironment: process.env.EXPO_PUBLIC_BUILD_ENV,
    coreApiUrl: process.env.EXPO_PUBLIC_CORE_API_URL,
    linkHost: process.env.EXPO_PUBLIC_LINK_HOST,
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  });

  return {
    ...config,
    ...appConfig,
    ios: {
      ...appConfig.ios,
      associatedDomains: [`applinks:${runtime.linkHost}`],
    },
    android: {
      ...appConfig.android,
      intentFilters: [{ action: "VIEW", autoVerify: true, data: [{ scheme: "https", host: runtime.linkHost, pathPrefix: "/s/" }], category: ["BROWSABLE", "DEFAULT"] }],
    },
    plugins: [...(appConfig.plugins ?? []), ["expo-notifications", { color: "#2F6B4F", defaultChannel: "default" }]],
    extra: {
      ...appConfig.extra,
      eas: runtime.projectId ? { projectId: runtime.projectId } : undefined,
      runtime,
    },
  };
};
