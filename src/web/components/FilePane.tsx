import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { colorVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { FolderInput, RotateCw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { FileInfo, FolderInfo } from "../api";
import { useDeleteFile, useImportPath, useRedoFile, useUpload } from "../queries";
import { format, go } from "../route";
import { StatusIcon } from "./StatusIcon";

const s = stylex.create({
  pane: { position: "relative", display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, borderInlineEndWidth: 1, borderInlineEndStyle: "solid", borderInlineEndColor: colorVars["--color-border"] },
  head: { paddingInline: spacingVars["--spacing-4"], paddingBlock: spacingVars["--spacing-3"], flexShrink: 0 },
  search: { paddingInline: spacingVars["--spacing-4"], paddingBlockEnd: spacingVars["--spacing-3"], flexShrink: 0 },
  list: { listStyleType: "none", margin: 0, paddingBlock: 0, paddingInline: spacingVars["--spacing-2"], overflowY: "auto", flexGrow: 1, display: "flex", flexDirection: "column", gap: spacingVars["--spacing-0-5"] },
  row: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-0-5"],
    borderRadius: radiusVars["--radius-element"],
    paddingInlineEnd: spacingVars["--spacing-1"],
    backgroundColor: { default: "transparent", ":hover": { "@media (hover: hover)": colorVars["--color-overlay-hover"] } },
  },
  rowActive: { backgroundColor: { default: colorVars["--color-background-muted"], ":hover": colorVars["--color-background-muted"] } },
  link: { display: "flex", alignItems: "center", gap: spacingVars["--spacing-2"], flexGrow: 1, minWidth: 0, minHeight: 40, paddingBlock: spacingVars["--spacing-1"], paddingInlineStart: spacingVars["--spacing-2"], color: "inherit", textDecoration: "none", borderRadius: radiusVars["--radius-element"] },
  name: { flexGrow: 1, minWidth: 0 },
  meta: { flexShrink: 0, whiteSpace: "nowrap" },
  empty: { paddingBlock: spacingVars["--spacing-4"], paddingInline: spacingVars["--spacing-2"] },
  drop: {
    position: "absolute",
    inset: spacingVars["--spacing-2"],
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: spacingVars["--spacing-6"],
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colorVars["--color-accent"],
    borderRadius: radiusVars["--radius-container"],
    backgroundColor: colorVars["--color-background-surface"],
    pointerEvents: "none",
  },
});

function SearchBox({ folder, q, enabled }: { folder: string; q: string | null; enabled: boolean }) {
  const [value, setValue] = useState(q ?? "");
  return (
    <div {...stylex.props(s.search)}>
      <TextInput
        id="search"
        type="search"
        label={`Search in ${folder}`}
        isLabelHidden
        placeholder={`Search in ${folder}`}
        startIcon="search"
        hasClear
        value={value}
        onChange={(next) => {
          setValue(next);
          if (!next && q) go({ folder }); // cleared: back to the folder
        }}
        onEnter={() => {
          if (value.trim()) go({ folder, q: value.trim() });
        }}
        isDisabled={!enabled}
        disabledMessage="Search is turned off in config.json"
        autoComplete="off"
      />
    </div>
  );
}

function ImportDialog({ folder, onClose }: { folder: string; onClose: () => void }) {
  const [path, setPath] = useState("");
  const add = useImportPath(folder);
  const ready = path.trim().length > 0 && !add.isPending;
  const close = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <Dialog isOpen onOpenChange={close} purpose="form" width={480}>
      <DialogHeader title={`Add a directory to ${folder}`} onOpenChange={close} />
      <form
        action={() => {
          if (ready) add.mutate(path.trim(), { onSuccess: onClose });
        }}
      >
        {/* DialogHeader insets its title; the body takes the same inset so the two line up. */}
        <VStack gap={4} paddingInline={4} paddingBlockEnd={4}>
          <TextInput
            label="Path on the computer that runs Bulk OCR"
            value={path}
            onChange={setPath}
            placeholder="/Users/you/Documents/scans"
            hasAutoFocus
            autoComplete="off"
            hasSpellCheck={false}
            description="Every PDF and image inside it is added, sub-directories too. The files stay where they are."
          />
          <HStack justify="end" gap={2}>
            <Button label="Cancel" variant="secondary" onClick={onClose} />
            <Button label="Add files" type="submit" variant="primary" isDisabled={!ready} isLoading={add.isPending} />
          </HStack>
        </VStack>
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
        <Text maxLines={1} hasTruncateTooltip xstyle={s.name}>
          {file.name}
        </Text>
        <Text size="sm" color="secondary" hasTabularNumbers xstyle={s.meta}>
          {meta}
        </Text>
      </a>
      <IconButton label={`Read ${file.name} again`} tooltip={busy ? "Being read" : "Read again"} icon={<RotateCw size={14} />} variant="ghost" size="sm" isDisabled={busy || redo.isPending} onClick={() => redo.mutate(file.id)} />
      <IconButton
        label={`Delete ${file.name}`}
        tooltip={file.status === "processing" ? "Being read now. Delete it when it finishes." : "Delete"}
        icon={<Trash2 size={14} />}
        variant="ghost"
        size="sm"
        isDisabled={file.status === "processing"}
        onClick={() => setConfirming(true)}
      />
      {confirming && (
        <AlertDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setConfirming(false);
          }}
          title={`Delete "${file.name}"?`}
          description="Its text, page images and search entries leave the app. If you uploaded it here, the uploaded copy is deleted too; a file added from a directory on this machine stays where it is. This cannot be undone."
          actionLabel="Delete file"
          actionVariant="destructive"
          isActionLoading={remove.isPending}
          onAction={() => remove.mutate(file.id, { onSuccess: () => setConfirming(false) })}
        />
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
      <HStack gap={2} align="center" xstyle={s.head}>
        <Heading level={1} maxLines={1} hasTruncateTooltip xstyle={s.name}>
          {folder.name}
        </Heading>
        <IconButton label="Add a directory from the computer" tooltip="Add a directory from the computer that runs Bulk OCR" icon={<FolderInput size={16} />} variant="ghost" onClick={() => setImporting(true)} />
        <Button label="Add files" icon={<Upload size={15} />} variant="primary" isLoading={upload.isPending} onClick={() => picker.current?.click()} />
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
      </HStack>
      <SearchBox key={q ?? ""} folder={folder.name} q={q} enabled={searchEnabled} />
      <ul {...stylex.props(s.list)}>
        {!files &&
          [0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton height={40} index={i} />
            </li>
          ))}
        {files?.map((f) => (
          <FileRow key={f.id} folder={folder.name} file={f} open={f.id === openId} openId={openId} />
        ))}
        {files?.length === 0 && (
          <li {...stylex.props(s.empty)}>
            <VStack gap={1}>
              <Text>This folder is empty.</Text>
              <Text size="sm" color="secondary">
                Drop PDFs, scans or photos here, or use Add files. They are read one at a time on this machine.
              </Text>
            </VStack>
          </li>
        )}
      </ul>
      {dragging && (
        <div {...stylex.props(s.drop)}>
          <Text weight="medium" color="accent">
            Drop to add to {folder.name}
          </Text>
        </div>
      )}
      {importing && <ImportDialog folder={folder.name} onClose={() => setImporting(false)} />}
    </section>
  );
}
