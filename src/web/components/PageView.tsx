import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { colorVars, radiusVars, shadowVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { type Page, api } from "../api";
import { SECTION, type SectionKind, kindOf } from "../sections";
import { Markdown } from "./Markdown";

const s = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: spacingVars["--spacing-2"], scrollMarginTop: spacingVars["--spacing-4"] },
  cols: { display: "grid", gap: spacingVars["--spacing-4"], alignItems: "start", gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 1fr)", "@media (max-width: 1280px)": "minmax(0, 1fr)" } },
  one: { gridTemplateColumns: "minmax(0, 1fr)" },
  shot: { position: "relative", borderRadius: radiusVars["--radius-container"], boxShadow: shadowVars["--shadow-med"], overflow: "hidden" },
  // Until the image arrives the space of a typical page is held, so nothing jumps when it does.
  waiting: { aspectRatio: "3 / 4", boxShadow: "none" },
  img: { display: "block", width: "100%", height: "auto" },
  hiddenImg: { opacity: 0, position: "absolute" },
  box: { position: "absolute", borderWidth: 1, borderStyle: "solid", borderRadius: 2 },
  tip: { position: "absolute", insetInlineStart: -1, insetBlockStart: -1, paddingInline: spacingVars["--spacing-1"], color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: "16px", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 1 },
  text: { backgroundColor: colorVars["--color-background-surface"], borderWidth: 1, borderStyle: "solid", borderColor: colorVars["--color-border"], borderRadius: radiusVars["--radius-container"], padding: spacingVars["--spacing-4"], minWidth: 0 },
});

type Props = { folder: string; fileId: number; fileName: string; page: Page; formatted: boolean; hidden: ReadonlySet<SectionKind> };

/** One page: the image the model saw with a box on every section it read, beside the text it wrote. */
export function PageView({ folder, fileId, fileName, page, formatted, hidden }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  return (
    <section id={`page-${page.page}`} aria-label={`Page ${page.page}`} {...stylex.props(s.page)}>
      <Text as="h3" size="sm" weight="medium" color="secondary">
        Page {page.page}
      </Text>
      <div {...stylex.props(s.cols, !page.hasImage && s.one)}>
        {page.hasImage && (
          <div {...stylex.props(s.shot, !loaded && s.waiting)}>
            {!loaded && <Skeleton width="100%" height="100%" />}
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
                    <span {...stylex.props(s.tip)} style={{ backgroundColor: ink, transform: "translateY(-100%)" }}>
                      {b.type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!page.text ? (
          <div {...stylex.props(s.text)}>
            <Text color="secondary">No text found on this page.</Text>
          </div>
        ) : formatted ? (
          <div {...stylex.props(s.text)}>
            <Markdown text={page.text} />
          </div>
        ) : (
          <CodeBlock code={page.text} language="markdown" isWrapped hasCopyButton />
        )}
      </div>
    </section>
  );
}
