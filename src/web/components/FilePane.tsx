import * as stylex from "@stylexjs/stylex";
import { FolderInput, RotateCw, Search, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { FileInfo, FolderInfo } from "../api";
import { useDeleteFile, useImportPath, useRedoFile, useUpload } from "../queries";
import { format, go } from "../route";
import { color, radius, space } from "../tokens.stylex";
import { ConfirmDialog, Dialog, DialogActions } from "./Dialog";
import { StatusIcon } from "./StatusIcon";
import { Button, IconButton, TextField } from "./ui";

const pulse = stylex.keyframes({ "50%": { opacity: 0.5 } });

const s = stylex.create({
  pane: { position: "relative", display: "flex", flexDirection: "column", minHeight: 0, borderInlineEndWidth: 1, borderInlineEndStyle: "solid", borderInlineEndColor: color.line },
  head: { display: "flex", alignItems: "center", gap: space.x2, height: 56, paddingInline: space.x4, flexShrink: 0 },
  title: { flexGrow: 1, minWidth: 0, fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  search: { position: "relative", display: "flex", alignItems: "center", marginInline: space.x4, marginBlockEnd: space.x3, flexShrink: 0 },
  searchIcon: { position: "absolute", insetInlineStart: 10, color: color.faint, display: "inline-flex", pointerEvents: "none" },
  searchInput: {
    width: "100%",
    height: 36,
    paddingInlineStart: 34,
    paddingInlineEnd: 34,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.line, ":focus": color.accent },
    borderRadius: radius.m,
    outlineStyle: "none",
    opacity: { default: 1, ":disabled": 0.4 },
    "::placeholder": { color: color.faint },
  },
  clear: { position: "absolute", insetInlineEnd: 4 },
  list: { listStyleType: "none", margin: 0, paddingBlock: 0, paddingInline: space.x2, overflowY: "auto", flexGrow: 1, display: "flex", flexDirection: "column", gap: 2 },
  row: { display: "flex", alignItems: "center", borderRadius: radius.m, paddingInlineEnd: space.x1, backgroundColor: { default: "transparent", ":hover": color.raised }, transitionProperty: "background-color", transitionDuration: "120ms" },
  rowActive: { backgroundColor: { default: color.raised2, ":hover": color.raised2 } },
  link: { display: "flex", alignItems: "center", gap: space.x2, flexGrow: 1, minWidth: 0, minHeight: 40, paddingBlock: space.x1, paddingInlineStart: space.x2, color: color.text, textDecoration: "none", borderRadius: radius.m, outlineWidth: { default: 0, ":focus-visible": 2 }, outlineStyle: "solid", outlineColor: color.accent, outlineOffset: -2 },
  name: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { fontSize: 12, color: color.faint, fontVariantNumeric: "tabular-nums", flexShrink: 0, paddingInline: space.x1 },
  skeleton: { height: 40, borderRadius: radius.m, backgroundColor: color.raised, animationName: pulse, animationDuration: "1.4s", animationIterationCount: "infinite", "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" } },
  empty: { paddingBlock: space.x4, paddingInline: space.x2, color: color.muted, display: "flex", flexDirection: "column", gap: space.x2 },
  hint: { fontSize: 12, color: color.faint },
  drop: { position: "absolute", inset: space.x2, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: space.x5, borderWidth: 2, borderStyle: "dashed", borderColor: color.accent, borderRadius: radius.l, backgroundColor: "rgb(18 18 18 / 0.88)", color: color.accent, fontWeight: 500, pointerEvents: "none" },
});

function SearchBox({ folder, q, enabled }: { folder: string; q: string | null; enabled: boolean }) {
  return (
    <form
      role="search"
      {...stylex.props(s.search)}
      title={enabled ? undefined : "Search is turned off in config.json"}
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("q")?.toString().trim();
        if (value) go({ folder, q: value });
      }}
    >
      <span {...stylex.props(s.searchIcon)}>
        <Search size={15} />
      </span>
      <input id="search" name="q" type="search" key={q ?? ""} defaultValue={q ?? ""} placeholder={`Search in ${folder}`} aria-label={`Search in ${folder}`} disabled={!enabled} required maxLength={200} autoComplete="off" {...stylex.props(s.searchInput)} />
      {q && (
        <span {...stylex.props(s.clear)}>
          <IconButton label="Clear search" onClick={() => go({ folder })}>
            <X size={14} />
          </IconButton>
        </span>
      )}
    </form>
  );
}

function ImportDialog({ folder, onClose }: { folder: string; onClose: () => void }) {
  const [path, setPath] = useState("");
  const add = useImportPath(folder);
  const ready = path.trim().length > 0 && !add.isPending;
  return (
    <Dialog title={`Add a directory to ${folder}`} onClose={onClose}>
      <form
        action={() => {
          if (ready) add.mutate(path.trim(), { onSuccess: onClose });
        }}
      >
        <TextField label="Path on this machine" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/you/Documents/scans" autoFocus autoComplete="off" spellCheck={false} hint="Every PDF and image inside it is added, sub-directories too. The files stay where they are." />
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready}>
            Add files
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function FileRow({ folder, file, open, openId }: { folder: string; file: FileInfo; open: boolean; openId: number | null }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteFile(folder, openId);
  const redo = useRedoFile(folder);
  const busy = file.status === "queued" || file.status === "processing";
  const meta = file.status === "processing" && file.page_count ? `${file.pages_done}/${file.page_count}` : file.page_count ? `${file.page_count} p` : "";
  return (
    <li {...stylex.props(s.row, open && s.rowActive)}>
      <a href={format({ folder, fileId: file.id })} aria-current={open ? "page" : undefined} {...stylex.props(s.link)}>
        <StatusIcon file={file} />
        <span {...stylex.props(s.name)} title={file.name}>
          {file.name}
        </span>
        <span {...stylex.props(s.meta)}>{meta}</span>
      </a>
      <IconButton label={busy ? "Being read" : `Read ${file.name} again`} disabled={busy || redo.isPending} onClick={() => redo.mutate(file.id)}>
        <RotateCw size={14} />
      </IconButton>
      <IconButton label={file.status === "processing" ? "Being read now. Delete it when it finishes." : `Delete ${file.name}`} danger disabled={file.status === "processing"} onClick={() => setConfirming(true)}>
        <Trash2 size={14} />
      </IconButton>
      {confirming && (
        <ConfirmDialog title={`Delete "${file.name}"?`} confirmLabel="Delete file" pending={remove.isPending} onConfirm={() => remove.mutate(file.id, { onSuccess: () => setConfirming(false) })} onClose={() => setConfirming(false)}>
          <p>Its text, page images and search entries leave the app. If you uploaded it here, the uploaded copy is deleted too; a file added from a directory on this machine stays where it is.</p>
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </li>
  );
}

type Props = { folder: FolderInfo; files: FileInfo[] | undefined; openId: number | null; q: string | null; searchEnabled: boolean };

export function FilePane({ folder, files, openId, q, searchEnabled }: Props) {
  const upload = useUpload(folder.name);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  return (
    <section
      aria-label={`Files in ${folder.name}`}
      {...stylex.props(s.pane)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        upload.mutate([...e.dataTransfer.files]);
      }}
    >
      <header {...stylex.props(s.head)}>
        <h1 {...stylex.props(s.title)} title={folder.name}>
          {folder.name}
        </h1>
        <IconButton label="Add a directory from this machine" onClick={() => setImporting(true)}>
          <FolderInput size={16} />
        </IconButton>
        <Button variant="primary" disabled={upload.isPending} onClick={() => picker.current?.click()}>
          <Upload size={15} />
          Add files
        </Button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.tif,.tiff,.gif,.bmp"
          onChange={(e) => {
            upload.mutate([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </header>
      <SearchBox folder={folder.name} q={q} enabled={searchEnabled} />
      <ul {...stylex.props(s.list)}>
        {!files && [0, 1, 2, 3].map((i) => <li key={i} {...stylex.props(s.skeleton)} />)}
        {files?.map((f) => (
          <FileRow key={f.id} folder={folder.name} file={f} open={f.id === openId} openId={openId} />
        ))}
        {files?.length === 0 && (
          <li {...stylex.props(s.empty)}>
            <span>This folder is empty.</span>
            <span {...stylex.props(s.hint)}>Drop PDFs, scans or photos here, or use Add files. They are read one at a time on this machine.</span>
          </li>
        )}
      </ul>
      {dragging && <div {...stylex.props(s.drop)}>Drop to add to {folder.name}</div>}
      {importing && <ImportDialog folder={folder.name} onClose={() => setImporting(false)} />}
    </section>
  );
}
