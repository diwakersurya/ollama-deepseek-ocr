import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { type Page, api } from "../api";
import { SECTION, type SectionKind, kindOf } from "../sections";
import { color, font, radius, space } from "../tokens.stylex";
import { Markdown } from "./Markdown";

const pulse = stylex.keyframes({ "50%": { opacity: 0.6 } });

const s = stylex.create({
  // Until the image arrives the space of a typical page is held, so nothing jumps when it does.
  waiting: { aspectRatio: "3 / 4", backgroundColor: color.raised2, boxShadow: "none", animationName: pulse, animationDuration: "1.4s", animationIterationCount: "infinite", "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" } },
  hiddenImg: { opacity: 0, position: "absolute" },
  page: { display: "flex", flexDirection: "column", gap: space.x2, scrollMarginTop: space.x4 },
  label: { fontSize: 13, fontWeight: 500, color: color.muted },
  cols: { display: "grid", gap: space.x4, alignItems: "start", gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 1fr)", "@media (max-width: 1280px)": "minmax(0, 1fr)" } },
  one: { gridTemplateColumns: "minmax(0, 1fr)" },
  shot: { position: "relative", backgroundColor: color.paper, borderRadius: radius.m, boxShadow: "0 1px 0 rgb(255 255 255 / 0.06), 0 8px 24px rgb(0 0 0 / 0.4)" },
  img: { display: "block", width: "100%", height: "auto", borderRadius: radius.m },
  box: { position: "absolute", borderWidth: 1, borderStyle: "solid", borderRadius: 2, transitionProperty: "background-color", transitionDuration: "120ms" },
  tip: { position: "absolute", insetInlineStart: -1, insetBlockEnd: "100%", paddingInline: space.x1, color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: "16px", whiteSpace: "nowrap", borderRadius: 2, pointerEvents: "none", zIndex: 1 },
  text: { backgroundColor: color.raised, borderRadius: radius.m, padding: space.x4, minWidth: 0 },
  raw: { margin: 0, fontFamily: font.mono, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  none: { color: color.faint },
});

type Props = { folder: string; fileId: number; fileName: string; page: Page; formatted: boolean; hidden: ReadonlySet<SectionKind> };

/** One page: the image the model saw with a box on every section it read, beside the text it wrote. */
export function PageView({ folder, fileId, fileName, page, formatted, hidden }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  return (
    <section id={`page-${page.page}`} aria-label={`Page ${page.page}`} {...stylex.props(s.page)}>
      <h3 {...stylex.props(s.label)}>Page {page.page}</h3>
      <div {...stylex.props(s.cols, !page.hasImage && s.one)}>
        {page.hasImage && (
          <div {...stylex.props(s.shot, !loaded && s.waiting)}>
            <img src={api.imageUrl(folder, fileId, page.page)} alt={`Page ${page.page} of ${fileName}`} onLoad={() => setLoaded(true)} {...stylex.props(s.img, !loaded && s.hiddenImg)} />
            {(loaded ? page.boxes : []).map((b, i) => {
              const kind = kindOf(b.type);
              if (hidden.has(kind)) return null;
              const { ink } = SECTION[kind];
              const [x1, y1, x2, y2] = b.box.map((n) => n / 9.99) as [number, number, number, number]; // 0..999 -> percent
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  {...stylex.props(s.box)}
                  style={{ left: `${x1}%`, top: `${y1}%`, width: `${x2 - x1}%`, height: `${y2 - y1}%`, borderColor: ink, backgroundColor: ink + (hover === i ? "40" : "14") }}
                >
                  {hover === i && (
                    <span {...stylex.props(s.tip)} style={{ backgroundColor: ink }}>
                      {b.type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div {...stylex.props(s.text)}>
          {!page.text ? <p {...stylex.props(s.none)}>No text found on this page.</p> : formatted ? <Markdown text={page.text} /> : <pre {...stylex.props(s.raw)}>{page.text}</pre>}
        </div>
      </div>
    </section>
  );
}
