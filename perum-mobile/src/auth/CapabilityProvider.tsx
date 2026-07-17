import { createContext, useContext, type PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { hasCapabilities, hasCapability } from './capabilities';
import type { TenantCapabilities } from './types';

type CapabilityContextValue = {
  has: (capability: keyof TenantCapabilities) => boolean;
  hasAll: (capabilities: readonly (keyof TenantCapabilities)[]) => boolean;
};

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

export function CapabilityProvider({ children }: PropsWithChildren) {
  const { account } = useAuth();
  return <CapabilityContext.Provider value={{ has: (capability) => hasCapability(account, capability), hasAll: (capabilities) => hasCapabilities(account, capabilities) }}>{children}</CapabilityContext.Provider>;
}

export function useCapabilities() {
  const value = useContext(CapabilityContext);
  if (!value) throw new Error('CapabilityProvider is missing');
  return value;
}
