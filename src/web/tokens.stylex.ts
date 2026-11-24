import * as stylex from "@stylexjs/stylex";

// Material dark: #121212 base, lighter greys for raised surfaces, 200-tone accents.
export const color = stylex.defineVars({
  surface: "#121212",
  raised: "#1b1b1b",
  raised2: "#232323",
  raised3: "#2e2e2e",
  line: "#333333",
  text: "#e6e6e6",
  muted: "#a3a3a3",
  faint: "#757575",
  accent: "#80cbc4",
  accentHover: "#a7dbd6",
  onAccent: "#00201c",
  accentWash: "rgb(128 203 196 / 0.14)",
  ok: "#a5d6a7",
  warn: "#ffcc80",
  bad: "#ef9a9a",
  badHover: "#f4b4b4",
  onBad: "#370b0b",
  paper: "#ffffff",
});

export const space = stylex.defineVars({ x1: "4px", x2: "8px", x3: "12px", x4: "16px", x5: "24px", x6: "32px", x7: "48px" });

export const radius = stylex.defineVars({ s: "4px", m: "8px", l: "12px" });

export const font = stylex.defineVars({
  ui: "'IBM Plex Sans Variable', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
});
