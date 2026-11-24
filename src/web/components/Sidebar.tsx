import * as stylex from "@stylexjs/stylex";
import { Folder, FolderOpen, FolderPlus, Pencil, ScanText, Trash2 } from "lucide-react";
import type { FolderInfo, Health } from "../api";
import { useStatus } from "../queries";
import { format } from "../route";
import { color, radius, space } from "../tokens.stylex";
import type { FolderDialog } from "./FolderDialogs";
import { IconButton } from "./ui";

const s = stylex.create({
  rail: { display: "flex", flexDirection: "column", minHeight: 0, backgroundColor: color.raised, borderInlineEndWidth: 1, borderInlineEndStyle: "solid", borderInlineEndColor: color.line },
  brand: { display: "flex", alignItems: "center", gap: space.x2, height: 56, paddingInline: space.x4, fontSize: 15, fontWeight: 600, color: color.text },
  brandIcon: { color: color.accent, display: "inline-flex" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingInlineStart: space.x4, paddingInlineEnd: space.x2, marginTop: space.x2 },
  heading: { fontSize: 12, fontWeight: 500, color: color.faint },
  list: { listStyleType: "none", margin: 0, padding: space.x2, overflowY: "auto", flexGrow: 1, display: "flex", flexDirection: "column", gap: 2 },
  row: { display: "flex", alignItems: "center", borderRadius: radius.m, backgroundColor: { default: "transparent", ":hover": color.raised2 }, paddingInlineEnd: space.x1, transitionProperty: "background-color", transitionDuration: "120ms" },
  rowActive: { backgroundColor: { default: color.accentWash, ":hover": color.accentWash } },
  link: { display: "flex", alignItems: "center", gap: space.x2, flexGrow: 1, minWidth: 0, height: 36, paddingInlineStart: space.x2, color: color.text, textDecoration: "none", borderRadius: radius.m, outlineWidth: { default: 0, ":focus-visible": 2 }, outlineStyle: "solid", outlineColor: color.accent, outlineOffset: -2 },
  linkActive: { color: color.accent, fontWeight: 500 },
  name: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  count: { fontSize: 12, color: color.faint, fontVariantNumeric: "tabular-nums", paddingInline: space.x1 },
  failed: { color: color.bad },
  none: { paddingBlock: space.x2, paddingInline: space.x2, color: color.faint, fontSize: 13 },
  status: { display: "flex", flexDirection: "column", gap: space.x2, padding: space.x4, borderBlockStartWidth: 1, borderBlockStartStyle: "solid", borderBlockStartColor: color.line, fontSize: 12, color: color.muted },
  line: { display: "flex", alignItems: "center", gap: space.x2, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  ok: { backgroundColor: color.ok },
  warn: { backgroundColor: color.warn },
  down: { backgroundColor: color.bad },
  off: { backgroundColor: color.faint },
});

function FolderRow({ folder, active, onDialog }: { folder: FolderInfo; active: boolean; onDialog: (d: FolderDialog) => void }) {
  const Icon = active ? FolderOpen : Folder;
  return (
    <li {...stylex.props(s.row, active && s.rowActive)}>
      <a href={format({ folder: folder.name })} aria-current={active ? "page" : undefined} {...stylex.props(s.link, active && s.linkActive)}>
        <Icon size={16} style={{ flexShrink: 0 }} />
        <span {...stylex.props(s.name)}>{folder.name}</span>
        <span {...stylex.props(s.count, folder.failed > 0 && s.failed)} title={folder.failed ? `${folder.files} files, ${folder.failed} could not be read` : `${folder.files} files`}>
          {folder.files}
        </span>
      </a>
      <IconButton label={`Rename ${folder.name}`} onClick={() => onDialog({ kind: "rename", folder })}>
        <Pencil size={14} />
      </IconButton>
      <IconButton label={`Delete ${folder.name}`} danger onClick={() => onDialog({ kind: "delete", folder })}>
        <Trash2 size={14} />
      </IconButton>
    </li>
  );
}

function ModelLine({ name, health }: { name: string; health: Health | null | undefined }) {
  const text = !health ? `${name}: off` : health.state === "ok" ? `${name} ready` : health.state === "warn" ? `${name}: check the model` : `${name} not reachable`;
  return (
    <div {...stylex.props(s.line)} title={health?.detail ?? "Turned off in config.json"}>
      <span {...stylex.props(s.dot, health ? s[health.state] : s.off)} />
      <span {...stylex.props(s.name)}>{text}</span>
    </div>
  );
}

/** What the machine is doing: the queue and the two model servers. */
function SystemStatus({ serverDown }: { serverDown: boolean }) {
  const { data } = useStatus();
  if (serverDown)
    return (
      <div {...stylex.props(s.status)}>
        <div {...stylex.props(s.line)}>
          <span {...stylex.props(s.dot, s.down)} />
          <span>The app is not answering. Start it with: bun run serve</span>
        </div>
      </div>
    );
  if (!data) return <div {...stylex.props(s.status)} style={{ minHeight: 92 }} />;
  return (
    <div {...stylex.props(s.status)}>
      <div {...stylex.props(s.line)}>
        <span {...stylex.props(s.dot, data.waiting ? s.warn : s.off)} />
        <span>{data.waiting ? `Reading, ${data.waiting} file${data.waiting === 1 ? "" : "s"} to go` : "Nothing waiting"}</span>
      </div>
      <ModelLine name="OCR model" health={data.ocr} />
      <ModelLine name="Search model" health={data.search} />
    </div>
  );
}

type Props = { folders: FolderInfo[]; current: string | null; loaded: boolean; serverDown: boolean; onDialog: (d: FolderDialog) => void };

export function Sidebar({ folders, current, loaded, serverDown, onDialog }: Props) {
  return (
    <nav aria-label="Folders" {...stylex.props(s.rail)}>
      <div {...stylex.props(s.brand)}>
        <span {...stylex.props(s.brandIcon)}>
          <ScanText size={20} />
        </span>
        Bulk OCR
      </div>
      <div {...stylex.props(s.head)}>
        <h2 {...stylex.props(s.heading)}>Folders</h2>
        <IconButton label="New folder" onClick={() => onDialog({ kind: "new" })}>
          <FolderPlus size={16} />
        </IconButton>
      </div>
      <ul {...stylex.props(s.list)}>
        {folders.map((f) => (
          <FolderRow key={f.name} folder={f} active={f.name === current} onDialog={onDialog} />
        ))}
        {loaded && !folders.length && <li {...stylex.props(s.none)}>No folders yet</li>}
      </ul>
      <SystemStatus serverDown={serverDown} />
    </nav>
  );
}
