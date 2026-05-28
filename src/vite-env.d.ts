/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_CONTEXT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
