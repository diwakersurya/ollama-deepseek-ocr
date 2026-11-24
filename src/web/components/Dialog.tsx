import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, radius, space } from "../tokens.stylex";
import { Button } from "./ui";

const appear = stylex.keyframes({ from: { opacity: 0, transform: "translateY(6px) scale(0.98)" } });

const s = stylex.create({
  dialog: {
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.l,
    backgroundColor: color.raised2,
    color: color.text,
    width: "min(440px, calc(100vw - 32px))",
    boxShadow: "0 24px 64px rgb(0 0 0 / 0.6)",
    animationName: appear,
    animationDuration: "140ms",
    animationTimingFunction: "ease-out",
    "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" },
  },
  panel: { display: "flex", flexDirection: "column", gap: space.x4, padding: space.x5 },
  title: { fontSize: 16, fontWeight: 600 },
  body: { display: "flex", flexDirection: "column", gap: space.x3, color: color.muted, overflowWrap: "anywhere" },
  actions: { display: "flex", justifyContent: "flex-end", gap: space.x2, marginTop: space.x2 },
});

type DialogProps = { title: string; onClose: () => void; children: ReactNode };

/** A modal on the browser's own <dialog>: Esc and a click outside close it, focus stays inside. */
export function Dialog({ title, onClose, children }: DialogProps) {
  return (
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      {...stylex.props(s.dialog)}
    >
      <div {...stylex.props(s.panel)}>
        <h2 {...stylex.props(s.title)}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div {...stylex.props(s.body)}>{children}</div>;
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div {...stylex.props(s.actions)}>{children}</div>;
}

type ConfirmProps = DialogProps & {
  confirmLabel: string;
  pending?: boolean;
  /** Why the action is not possible right now; the button is disabled and this is shown. */
  blocked?: string | null;
  onConfirm: () => void;
};

/** For actions that cannot be undone. */
export function ConfirmDialog({ title, onClose, children, confirmLabel, pending, blocked, onConfirm }: ConfirmProps) {
  return (
    <Dialog title={title} onClose={onClose}>
      <DialogBody>
        {children}
        {blocked && <p>{blocked}</p>}
      </DialogBody>
      <DialogActions>
        <Button onClick={onClose} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" disabled={pending || !!blocked} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
