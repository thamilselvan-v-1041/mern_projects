/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full API base URL; omit in dev to use Vite `/api` proxy */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
