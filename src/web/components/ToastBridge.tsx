import { useToast } from "@astryxdesign/core/Toast";
import { useEffect } from "react";
import { toast } from "../toast";

/** Shows the messages of toast.ts as Astryx toasts. Rendered once, inside LayerProvider. */
export function ToastBridge() {
  const showToast = useToast();
  useEffect(() => toast.connect(({ kind, text }) => showToast({ body: text, type: kind === "bad" ? "error" : "info" })), [showToast]);
  return null;
}
