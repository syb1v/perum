import type { ExpoConfig, ConfigContext } from "expo/config";

import baseConfig from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EXPO_PROJECT_ID;
  const appConfig = baseConfig.expo as ExpoConfig;
  const linkHost = process.env.EXPO_PUBLIC_LINK_HOST || "link.perum.app";

  return {
    ...config,
    ...appConfig,
    ios: {
      ...appConfig.ios,
      associatedDomains: [`applinks:${linkHost}`],
    },
    android: {
      ...appConfig.android,
      intentFilters: [{ action: "VIEW", autoVerify: true, data: [{ scheme: "https", host: linkHost, pathPrefix: "/s/" }], category: ["BROWSABLE", "DEFAULT"] }],
    },
    plugins: [...(appConfig.plugins ?? []), ["expo-notifications", { color: "#2F6B4F", defaultChannel: "default" }]],
    extra: {
      ...appConfig.extra,
      eas: projectId ? { projectId } : undefined,
    },
  };
};
