import * as stylex from "@stylexjs/stylex";
import { Copy, Download, FileX } from "lucide-react";
import { useEffect, useState } from "react";
import type { FileInfo, Page } from "../api";
import { useFile } from "../queries";
import { SECTION, type SectionKind, kindOf } from "../sections";
import { toast } from "../toast";
import { color, radius, space } from "../tokens.stylex";
import { EmptyState } from "./EmptyState";
import { PageView } from "./PageView";
import { StatusIcon, statusText } from "./StatusIcon";
import { Button } from "./ui";

const pulse = stylex.keyframes({ "50%": { opacity: 0.5 } });

const s = stylex.create({
  wrap: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%" },
  head: { display: "flex", alignItems: "center", gap: space.x3, minHeight: 56, paddingInline: space.x5, flexShrink: 0, flexWrap: "wrap", paddingBlock: space.x2 },
  title: { flexGrow: 1, minWidth: 0, display: "flex", alignItems: "center", gap: space.x2 },
  name: { fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  seg: { display: "inline-flex", padding: 2, backgroundColor: color.raised, borderRadius: radius.m, borderWidth: 1, borderStyle: "solid", borderColor: color.line },
  segBtn: { height: 26, paddingInline: space.x3, borderWidth: 0, borderRadius: 6, backgroundColor: "transparent", color: color.muted, fontSize: 13, cursor: "pointer", outlineWidth: { default: 0, ":focus-visible": 2 }, outlineStyle: "solid", outlineColor: color.accent },
  segOn: { backgroundColor: color.raised3, color: color.text },
  legend: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: space.x2, paddingInline: space.x5, paddingBlockEnd: space.x3, flexShrink: 0, fontSize: 13, color: color.muted },
  chip: { display: "inline-flex", alignItems: "center", gap: space.x2, height: 26, paddingInline: space.x2, borderWidth: 1, borderStyle: "solid", borderColor: color.line, borderRadius: 13, backgroundColor: { default: "transparent", ":hover": color.raised2 }, cursor: "pointer", fontSize: 12, color: color.text, outlineWidth: { default: 0, ":focus-visible": 2 }, outlineStyle: "solid", outlineColor: color.accent, transitionProperty: "opacity, background-color", transitionDuration: "120ms" },
  chipOff: { opacity: 0.45 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  body: { flexGrow: 1, overflowY: "auto", paddingInline: space.x5, paddingBlockEnd: space.x6, display: "flex", flexDirection: "column", gap: space.x5 },
  error: { color: color.bad, backgroundColor: color.raised, borderRadius: radius.m, padding: space.x4, overflowWrap: "anywhere" },
  note: { color: color.muted },
  skeleton: { height: 320, borderRadius: radius.m, backgroundColor: color.raised, animationName: pulse, animationDuration: "1.4s", animationIterationCount: "infinite", "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" } },
});

const allText = (pages: Page[]) => pages.map((p) => p.text).join("\n\n---\n\n") + "\n";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  Object.assign(document.createElement("a"), { href: url, download: name.replace(/^.*\//, "") + ".md" }).click();
  URL.revokeObjectURL(url);
}

/** The kinds of section found in this file, as switches that show or hide their boxes. */
function Legend({ pages, hidden, onToggle }: { pages: Page[]; hidden: ReadonlySet<SectionKind>; onToggle: (k: SectionKind) => void }) {
  const counts = new Map<SectionKind, number>();
  for (const p of pages) for (const b of p.boxes) counts.set(kindOf(b.type), (counts.get(kindOf(b.type)) ?? 0) + 1);
  if (!counts.size) return null;
  return (
    <div {...stylex.props(s.legend)}>
      <span>Marked on the page</span>
      {(Object.keys(SECTION) as SectionKind[])
        .filter((k) => counts.has(k))
        .map((k) => (
          <button key={k} type="button" aria-pressed={!hidden.has(k)} title={hidden.has(k) ? `Show ${SECTION[k].label.toLowerCase()}` : `Hide ${SECTION[k].label.toLowerCase()}`} onClick={() => onToggle(k)} {...stylex.props(s.chip, hidden.has(k) && s.chipOff)}>
            <span {...stylex.props(s.swatch)} style={{ backgroundColor: SECTION[k].chip }} />
            {SECTION[k].label} {counts.get(k)}
          </button>
        ))}
    </div>
  );
}

type Props = { folder: string; id: number; page: number | null; info: FileInfo | undefined };

export function Viewer({ folder, id, page, info }: Props) {
  const { data, isPending, isError } = useFile(folder, id, info?.status ?? "done");
  const [formatted, setFormatted] = useState(true);
  const [hidden, setHidden] = useState<ReadonlySet<SectionKind>>(new Set());
  const loaded = !!data;
  // A search result links to a page: bring it into view once the file is on screen.
  useEffect(() => {
    if (loaded && page) document.getElementById(`page-${page}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded, page, id]);

  if (isError)
    return (
      <EmptyState icon={<FileX size={32} />} title="This file is not in the folder">
        It may have been deleted. Pick another file from the list.
      </EmptyState>
    );
  if (isPending)
    return (
      <div {...stylex.props(s.wrap)}>
        <div {...stylex.props(s.head)} />
        <div {...stylex.props(s.body)}>
          <div {...stylex.props(s.skeleton)} />
        </div>
      </div>
    );

  const { file, pages } = data;
  const live = info ?? { ...file, pages_done: pages.length };
  const toggle = (k: SectionKind) => setHidden((old) => new Set(old.has(k) ? [...old].filter((x) => x !== k) : [...old, k]));
  return (
    <div {...stylex.props(s.wrap)}>
      <header {...stylex.props(s.head)}>
        <div {...stylex.props(s.title)}>
          <StatusIcon file={live} />
          <h2 {...stylex.props(s.name)} title={file.name}>
            {file.name}
          </h2>
        </div>
        <div role="group" aria-label="How the text is shown" {...stylex.props(s.seg)}>
          <button type="button" aria-pressed={formatted} onClick={() => setFormatted(true)} {...stylex.props(s.segBtn, formatted && s.segOn)}>
            Formatted
          </button>
          <button type="button" aria-pressed={!formatted} onClick={() => setFormatted(false)} {...stylex.props(s.segBtn, !formatted && s.segOn)}>
            Markdown
          </button>
        </div>
        <Button
          disabled={!pages.length}
          onClick={async () => {
            await navigator.clipboard.writeText(allText(pages));
            toast.ok("Text copied");
          }}
        >
          <Copy size={14} />
          Copy text
        </Button>
        <Button disabled={!pages.length} onClick={() => download(file.name, allText(pages))}>
          <Download size={14} />
          Download .md
        </Button>
      </header>
      <Legend pages={pages} hidden={hidden} onToggle={toggle} />
      <div {...stylex.props(s.body)}>
        {file.error && <p {...stylex.props(s.error)}>{file.error}</p>}
        {!pages.length && !file.error && <p {...stylex.props(s.note)}>{statusText(live)}. Pages show up here as they are read.</p>}
        {pages.map((p) => (
          <PageView key={p.page} folder={folder} fileId={id} fileName={file.name} page={p} formatted={formatted} hidden={hidden} />
        ))}
      </div>
    </div>
  );
}
