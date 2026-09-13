/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_GOLD_LINK?: string;
  readonly VITE_STRIPE_VIP_LINK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
