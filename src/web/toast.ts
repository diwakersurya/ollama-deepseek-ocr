import { useSyncExternalStore } from "react";

export type Toast = { id: number; kind: "ok" | "bad"; text: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function show(kind: Toast["kind"], text: string) {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, kind, text }];
  emit();
  setTimeout(() => toast.dismiss(id), kind === "bad" ? 8000 : 4000);
}

export const toast = {
  ok: (text: string) => show("ok", text),
  bad: (text: string) => show("bad", text),
  dismiss(id: number) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },
};

export const useToasts = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => toasts,
  );
