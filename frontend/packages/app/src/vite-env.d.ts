/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_AUTH_PROVIDER?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID?: string;
  readonly VITE_PRODTRACK_TAB_SYNC_INSTALL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
