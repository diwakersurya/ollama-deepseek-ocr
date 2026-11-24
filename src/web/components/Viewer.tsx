import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { colorVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Copy, Download, FileX } from "lucide-react";
import { useEffect, useState } from "react";
import type { FileInfo, Page } from "../api";
import { useFile } from "../queries";
import { SECTION, type SectionKind, kindOf } from "../sections";
import { copyText } from "../clipboard";
import { BackToFiles } from "./BackToFiles";
import { PageView } from "./PageView";
import { StatusIcon, statusText } from "./StatusIcon";

const s = stylex.create({
  wrap: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%" },
  head: { paddingInline: spacingVars["--spacing-6"], paddingBlock: spacingVars["--spacing-3"], flexShrink: 0 },
  // A long file name is cut short before the buttons are pushed to a second line.
  title: { flexGrow: 1, flexBasis: 0, minWidth: 200 },
  legend: { paddingInline: spacingVars["--spacing-6"], paddingBlockEnd: spacingVars["--spacing-3"], flexShrink: 0 },
  swatch: { display: "inline-block", width: 10, height: 10, borderRadius: 2 },
  body: { flexGrow: 1, overflowY: "auto", paddingInline: spacingVars["--spacing-6"], paddingBlockEnd: spacingVars["--spacing-8"], display: "flex", flexDirection: "column", gap: spacingVars["--spacing-6"] },
  error: { backgroundColor: colorVars["--color-error-muted"], borderRadius: radiusVars["--radius-container"], padding: spacingVars["--spacing-4"] },
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
    <HStack gap={2} align="center" wrap="wrap" xstyle={s.legend}>
      <Text size="sm" color="secondary">
        Marked on the page
      </Text>
      {(Object.keys(SECTION) as SectionKind[])
        .filter((k) => counts.has(k))
        .map((k) => (
          <ToggleButton
            key={k}
            size="sm"
            label={`${SECTION[k].label} ${counts.get(k)}`}
            tooltip={hidden.has(k) ? `Show ${SECTION[k].label.toLowerCase()}` : `Hide ${SECTION[k].label.toLowerCase()}`}
            icon={<span {...stylex.props(s.swatch)} style={{ backgroundColor: SECTION[k].ink }} />}
            isPressed={!hidden.has(k)}
            onPressedChange={() => onToggle(k)}
          />
        ))}
    </HStack>
  );
}

type Props = { folder: string; id: number; page: number | null; info: FileInfo | undefined };

export function Viewer({ folder, id, page, info }: Props) {
  const { data, isPending, isError } = useFile(folder, id, info?.status ?? "done");
  const [view, setView] = useState("formatted");
  const [hidden, setHidden] = useState<ReadonlySet<SectionKind>>(new Set());
  const loaded = !!data;
  // A search result links to a page: bring it into view once the file is on screen.
  useEffect(() => {
    if (loaded && page) document.getElementById(`page-${page}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded, page, id]);

  if (isError)
    return (
      <EmptyState icon={<FileX size={32} />} title="This file is not in the folder" description="It may have been deleted. Pick another file from the list." actions={<BackToFiles folder={folder} />} />
    );
  if (isPending)
    return (
      <div {...stylex.props(s.wrap)}>
        <div {...stylex.props(s.head)}>
          <Skeleton width={280} height={32} />
        </div>
        <div {...stylex.props(s.body)}>
          <Skeleton height={320} />
        </div>
      </div>
    );

  const { file, pages } = data;
  const live = info ?? { ...file, pages_done: pages.length };
  const toggle = (k: SectionKind) => setHidden((old) => new Set(old.has(k) ? [...old].filter((x) => x !== k) : [...old, k]));
  return (
    <div {...stylex.props(s.wrap)}>
      <HStack gap={3} align="center" wrap="wrap" xstyle={s.head}>
        <HStack gap={2} align="center" xstyle={s.title}>
          <BackToFiles folder={folder} />
          <StatusIcon file={live} />
          <Heading level={2} maxLines={1} hasTruncateTooltip>
            {file.name}
          </Heading>
        </HStack>
        <SegmentedControl label="How the text is shown" size="sm" value={view} onChange={setView}>
          <SegmentedControlItem value="formatted" label="Formatted" />
          <SegmentedControlItem value="markdown" label="Markdown" />
        </SegmentedControl>
        <Button
          label="Copy text"
          icon={<Copy size={14} />}
          variant="secondary"
          isDisabled={!pages.length}
          onClick={() => copyText(allText(pages), "Text copied")}
        />
        <Button label="Download .md" icon={<Download size={14} />} variant="secondary" isDisabled={!pages.length} onClick={() => download(file.name, allText(pages))} />
      </HStack>
      <Legend pages={pages} hidden={hidden} onToggle={toggle} />
      <div {...stylex.props(s.body)}>
        {file.error && (
          <div {...stylex.props(s.error)}>
            <Text wordBreak="break-word">{file.error}</Text>
          </div>
        )}
        {!pages.length && !file.error && <Text color="secondary">{statusText(live)}. Pages show up here as they are read.</Text>}
        {pages.map((p) => (
          <PageView key={p.page} folder={folder} fileId={id} fileName={file.name} page={p} formatted={view === "formatted"} hidden={hidden} />
        ))}
      </div>
    </div>
  );
}
