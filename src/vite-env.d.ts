/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BOT_USERNAME?: string;
  readonly VITE_SUPPORT_URL?: string;
  readonly VITE_SUPPORT_USERNAME?: string;
  readonly VITE_PRIVACY_URL?: string;
  readonly VITE_ENABLE_MOCK_API?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}