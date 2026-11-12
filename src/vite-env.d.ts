/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARMAZENAMENTO?: 'local' | 'api';
  readonly VITE_API_URL?: string;
}
