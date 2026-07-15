import type { ExpoConfig, ConfigContext } from "expo/config";

import baseConfig from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EXPO_PROJECT_ID;
  const appConfig = baseConfig.expo as ExpoConfig;

  return {
    ...config,
    ...appConfig,
    extra: {
      ...appConfig.extra,
      eas: projectId ? { projectId } : undefined,
    },
  };
};
