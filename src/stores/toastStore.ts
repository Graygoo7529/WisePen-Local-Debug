import { create } from "zustand";

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastItem["kind"], text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, kind === "error" ? 6000 : 3000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (text: string) => useToastStore.getState().push("success", text),
  error: (text: string) => useToastStore.getState().push("error", text),
  info: (text: string) => useToastStore.getState().push("info", text),
};
