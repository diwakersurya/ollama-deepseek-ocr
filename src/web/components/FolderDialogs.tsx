import { useState } from "react";
import { folderName } from "../../shared/schema";
import type { FolderInfo } from "../api";
import { useCreateFolder, useDeleteFolder, useRenameFolder } from "../queries";
import { ConfirmDialog, Dialog, DialogActions } from "./Dialog";
import { Button, TextField } from "./ui";

export type FolderDialog = { kind: "new" } | { kind: "rename"; folder: FolderInfo } | { kind: "delete"; folder: FolderInfo } | null;

type NameFormProps = {
  title: string;
  initial: string;
  taken: string[];
  submitLabel: string;
  pending: boolean;
  blocked?: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
};

/** The one form for naming a folder, used to create and to rename. */
function NameForm({ title, initial, taken, submitLabel, pending, blocked, onSubmit, onClose }: NameFormProps) {
  const [value, setValue] = useState(initial);
  const parsed = folderName.safeParse(value);
  const name = parsed.success ? parsed.data : null;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const clash = name !== null && !same(name, initial) && taken.some((t) => same(t, name));
  const error = !value.trim()
    ? null
    : !parsed.success
      ? parsed.error.issues[0]!.message
      : clash
        ? `A folder named "${name}" already exists`
        : null;
  const ready = name !== null && !clash && name !== initial && !blocked && !pending;
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        action={() => {
          if (ready) onSubmit(name);
        }}
      >
        <TextField
          label="Folder name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          autoFocus
          autoComplete="off"
          maxLength={50}
          error={error}
          hint={blocked ?? "One folder per kind of document, for example Receipts or Contracts."}
        />
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

type Props = { dialog: FolderDialog; folders: FolderInfo[]; current: string | null; onClose: () => void };

export function FolderDialogs({ dialog, folders, current, onClose }: Props) {
  const create = useCreateFolder();
  const rename = useRenameFolder(current);
  const remove = useDeleteFolder(current);
  if (!dialog) return null;
  const taken = folders.map((f) => f.name);
  const done = { onSuccess: onClose };

  if (dialog.kind === "new")
    return (
      <NameForm title="New folder" initial="" taken={taken} submitLabel="Create folder" pending={create.isPending} onSubmit={(name) => create.mutate(name, done)} onClose={onClose} />
    );

  const { name, files, active } = dialog.folder;
  const busy = active ? `${active} file${active === 1 ? " is" : "s are"} still being read. Try again when ${active === 1 ? "it finishes" : "they finish"}.` : null;

  if (dialog.kind === "rename")
    return (
      <NameForm
        title={`Rename "${name}"`}
        initial={name}
        taken={taken}
        submitLabel="Rename folder"
        pending={rename.isPending}
        blocked={busy}
        onSubmit={(next) => rename.mutate({ folder: name, name: next }, done)}
        onClose={onClose}
      />
    );

  return (
    <ConfirmDialog title={`Delete folder "${name}"?`} confirmLabel="Delete folder" pending={remove.isPending} blocked={busy} onConfirm={() => remove.mutate(name, done)} onClose={onClose}>
      <p>
        {files === 0 ? "The folder is empty." : `Its ${files} file${files === 1 ? "" : "s"} leave${files === 1 ? "s" : ""} the app: text, page images, search index and uploaded copies.`} Files added
        from a directory on this machine stay where they are.
      </p>
      <p>This cannot be undone.</p>
    </ConfirmDialog>
  );
}
