export type BuildEnvironment = 'development' | 'preview' | 'production';

export type RuntimeConfig = {
  buildEnvironment: BuildEnvironment;
  coreApiUrl: string;
  linkHost: string;
  projectId: string | null;
};

export type RuntimeConfigInput = {
  buildEnvironment?: string;
  coreApiUrl?: string;
  linkHost?: string;
  projectId?: string;
};

export function parseRuntimeConfig(input: RuntimeConfigInput): RuntimeConfig;
