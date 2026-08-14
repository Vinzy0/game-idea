import { DemoProvider } from '../demoProvider';
import { createProvider, loadProviderConfig } from '../factory';
import { HttpGatewayProvider } from '../httpGateway';

function env(overrides: Record<string, string | undefined> = {}): ImportMetaEnv {
  return { ...overrides } as ImportMetaEnv;
}

describe('loadProviderConfig', () => {
  it('defaults to demo with no configuration', () => {
    expect(loadProviderConfig(env())).toEqual({
      provider: 'demo',
      gatewayUrl: '',
      modelLabel: '',
    });
  });

  it('uses the gateway only when explicitly selected and a URL is set', () => {
    expect(loadProviderConfig(env({ VITE_AI_PROVIDER: 'gateway' }))).toMatchObject({
      provider: 'demo',
    });
    expect(
      loadProviderConfig(
        env({ VITE_AI_PROVIDER: 'gateway', VITE_AI_GATEWAY_URL: 'http://dm.local' }),
      ),
    ).toMatchObject({ provider: 'gateway', gatewayUrl: 'http://dm.local' });
  });

  it('reads the optional model label', () => {
    expect(
      loadProviderConfig(
        env({
          VITE_AI_PROVIDER: 'gateway',
          VITE_AI_GATEWAY_URL: 'http://dm.local',
          VITE_AI_MODEL_LABEL: 'gpt-test',
        }),
      ).modelLabel,
    ).toBe('gpt-test');
  });

  it('treats unknown provider values as demo', () => {
    expect(loadProviderConfig(env({ VITE_AI_PROVIDER: 'banana' })).provider).toBe('demo');
  });
});

describe('createProvider', () => {
  it('builds the demo provider by default', () => {
    expect(createProvider({ provider: 'demo', gatewayUrl: '', modelLabel: '' })).toBeInstanceOf(
      DemoProvider,
    );
  });

  it('builds the gateway provider when configured', () => {
    const provider = createProvider({
      provider: 'gateway',
      gatewayUrl: 'http://dm.local',
      modelLabel: 'm',
    });
    expect(provider).toBeInstanceOf(HttpGatewayProvider);
    expect(provider.label).toBe('Gateway (m)');
  });
});
