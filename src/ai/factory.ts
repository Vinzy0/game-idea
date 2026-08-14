/**
 * Provider factory from non-secret Vite env values.
 *
 * Only three values exist, none of them secrets:
 *   VITE_AI_PROVIDER      'demo' | 'gateway' (anything else → demo)
 *   VITE_AI_GATEWAY_URL   gateway endpoint; missing/empty → demo
 *   VITE_AI_MODEL_LABEL   optional display-only model label
 *
 * Defaults safely to the offline demo provider whenever a gateway is not
 * fully configured.
 */
import { DemoProvider } from './demoProvider';
import { createHttpProvider } from './httpGateway';
import type { AIProvider } from './provider';

export interface AIProviderConfig {
  provider: 'demo' | 'gateway';
  gatewayUrl: string;
  modelLabel: string;
}

export function loadProviderConfig(
  env: ImportMetaEnv = import.meta.env,
): AIProviderConfig {
  const gatewayUrl = (env.VITE_AI_GATEWAY_URL ?? '').trim();
  const modelLabel = (env.VITE_AI_MODEL_LABEL ?? '').trim();
  const useGateway = env.VITE_AI_PROVIDER === 'gateway' && gatewayUrl.length > 0;
  return {
    provider: useGateway ? 'gateway' : 'demo',
    gatewayUrl,
    modelLabel,
  };
}

export function createProvider(config: AIProviderConfig): AIProvider {
  return config.provider === 'gateway'
    ? createHttpProvider({ url: config.gatewayUrl, model: config.modelLabel || undefined })
    : new DemoProvider();
}
