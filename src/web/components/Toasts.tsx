import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { color, radius, space } from "../tokens.stylex";
import { toast, useToasts } from "../toast";
import { IconButton } from "./ui";

const slide = stylex.keyframes({ from: { opacity: 0, transform: "translateY(8px)" } });

const s = stylex.create({
  stack: { position: "fixed", right: space.x5, bottom: space.x5, zIndex: 10, display: "flex", flexDirection: "column", gap: space.x2, width: "min(380px, calc(100vw - 48px))" },
  toast: {
    display: "flex",
    alignItems: "flex-start",
    gap: space.x2,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    backgroundColor: color.raised3,
    borderRadius: radius.m,
    borderInlineStartWidth: 3,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: color.ok,
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.5)",
    animationName: slide,
    animationDuration: "160ms",
    "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" },
  },
  bad: { borderInlineStartColor: color.bad },
  text: { flexGrow: 1, paddingBlock: space.x1, overflowWrap: "anywhere" },
});

export function Toasts() {
  const toasts = useToasts();
  return (
    <div role="status" aria-live="polite" {...stylex.props(s.stack)}>
      {toasts.map((t) => (
        <div key={t.id} {...stylex.props(s.toast, t.kind === "bad" && s.bad)}>
          <span {...stylex.props(s.text)}>{t.text}</span>
          <IconButton label="Dismiss" onClick={() => toast.dismiss(t.id)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
