/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_AI_GATEWAY_URL?: string;
  readonly VITE_AI_MODEL_LABEL?: string;
}
