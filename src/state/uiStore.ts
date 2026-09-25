import { createStore } from "zustand/vanilla";

export type UiScreen = string;

export type UiToast = {
  id: string;
  message: string;
  kind: "info" | "warn" | "gold" | "quest" | "power" | "achievement";
};

export type SunbirdUiState = {
  screen: UiScreen;
  locale: string;
  booting: boolean;
  toasts: UiToast[];
  setScreen: (screen: UiScreen) => void;
  setLocale: (locale: string) => void;
  setBooting: (booting: boolean) => void;
  pushToast: (toast: Omit<UiToast, "id">) => void;
  removeToast: (id: string) => void;
};

let toastSequence = 0;

/**
 * UI/session state only. The authoritative flight state stays in Game/Bird;
 * this store exists to give React and imperative HUD code one small shared
 * surface without putting frame-by-frame simulation into React subscriptions.
 */
export const uiStore = createStore<SunbirdUiState>()((set) => ({
  screen: "main",
  locale: "en",
  booting: true,
  toasts: [],
  setScreen: (screen) => set({ screen }),
  setLocale: (locale) => set({ locale }),
  setBooting: (booting) => set({ booting }),
  pushToast: (toast) => set((state) => ({
    toasts: [...state.toasts, { ...toast, id: `toast-${++toastSequence}` }].slice(-4),
  })),
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
