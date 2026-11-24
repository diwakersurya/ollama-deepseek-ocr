import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, space } from "../tokens.stylex";

const s = stylex.create({
  wrap: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: space.x3, maxWidth: 440, padding: space.x7, color: color.muted },
  icon: { color: color.faint },
  title: { fontSize: 18, fontWeight: 600, color: color.text },
  action: { marginTop: space.x2 },
});

type Props = { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode };

/** An empty screen says what to do next. */
export function EmptyState({ icon, title, children, action }: Props) {
  return (
    <div {...stylex.props(s.wrap)}>
      {icon && <div {...stylex.props(s.icon)}>{icon}</div>}
      <h2 {...stylex.props(s.title)}>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div {...stylex.props(s.action)}>{action}</div>}
    </div>
  );
}
