/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REOWN_PROJECT_ID?: string;
  readonly VITE_REGISTRY_ADDRESS?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_IPFS_GATEWAY?: string;
  readonly VITE_HISAISHI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
