import * as stylex from "@stylexjs/stylex";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useId } from "react";
import { color, radius, space } from "../tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const s = stylex.create({
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.x2,
    flexShrink: 0,
    height: 32,
    paddingInline: space.x3,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: radius.m,
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    opacity: { default: 1, ":disabled": 0.4 },
    transitionProperty: "background-color, border-color, color",
    transitionDuration: "120ms",
    outlineWidth: { default: 0, ":focus-visible": 2 },
    outlineStyle: "solid",
    outlineColor: color.accent,
    outlineOffset: 2,
  },
  primary: { backgroundColor: { default: color.accent, ":hover": color.accentHover }, color: color.onAccent },
  quiet: { backgroundColor: { default: "transparent", ":hover": color.raised3 }, borderColor: color.line, color: color.text },
  danger: { backgroundColor: { default: color.bad, ":hover": color.badHover }, color: color.onBad },
  icon: {
    width: 28,
    height: 28,
    paddingInline: 0,
    borderRadius: radius.s,
    backgroundColor: { default: "transparent", ":hover": color.raised3 },
    color: { default: color.muted, ":hover": color.text },
  },
  iconDanger: { color: { default: color.muted, ":hover": color.bad } },
  field: { display: "flex", flexDirection: "column", gap: space.x1 },
  label: { fontSize: 13, fontWeight: 500, color: color.muted },
  input: {
    height: 36,
    paddingInline: space.x3,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.line, ":focus": color.accent },
    borderRadius: radius.m,
    outlineStyle: "none",
    transitionProperty: "border-color",
    transitionDuration: "120ms",
    "::placeholder": { color: color.faint },
  },
  inputBad: { borderColor: { default: color.bad, ":focus": color.bad } },
  note: { fontSize: 12, color: color.faint, minHeight: 17 },
  noteBad: { color: color.bad },
  spinner: { animationName: spin, animationDuration: "1s", animationTimingFunction: "linear", animationIterationCount: "infinite", "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" } },
});

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  variant?: "primary" | "quiet" | "danger";
};

export function Button({ variant = "quiet", type = "button", ...rest }: ButtonProps) {
  return <button type={type} {...rest} {...stylex.props(s.button, s[variant])} />;
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "aria-label" | "title"> & {
  /** What the button does: read by screen readers and shown on hover. */
  label: string;
  danger?: boolean;
};

export function IconButton({ label, danger, type = "button", ...rest }: IconButtonProps) {
  return <button type={type} aria-label={label} title={label} {...rest} {...stylex.props(s.button, s.icon, danger && s.iconDanger)} />;
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style"> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
};

export function TextField({ label, error, hint, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <div {...stylex.props(s.field)}>
      <label htmlFor={id} {...stylex.props(s.label)}>
        {label}
      </label>
      <input id={id} type="text" aria-invalid={!!error} aria-describedby={id + "-note"} {...rest} {...stylex.props(s.input, !!error && s.inputBad)} />
      <p id={id + "-note"} {...stylex.props(s.note, !!error && s.noteBad)}>
        {error ?? hint}
      </p>
    </div>
  );
}

/** Wrap a lucide icon in this to make it turn. */
export function Spin({ children }: { children: ReactNode }) {
  return <span {...stylex.props(s.spinner)} style={{ display: "inline-flex" }}>{children}</span>;
}
