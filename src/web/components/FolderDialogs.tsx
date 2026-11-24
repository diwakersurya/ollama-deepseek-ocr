import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { folderName } from "../../shared/schema";
import type { FolderInfo } from "../api";
import { useCreateFolder, useDeleteFolder, useRenameFolder } from "../queries";

export type FolderDialog = { kind: "new" } | { kind: "rename"; folder: FolderInfo } | { kind: "delete"; folder: FolderInfo } | null;

type NameFormProps = {
  title: string;
  initial: string;
  taken: string[];
  submitLabel: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
};

/** The one form for naming a folder, used to create and to rename. */
function NameForm({ title, initial, taken, submitLabel, pending, onSubmit, onClose }: NameFormProps) {
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
  const ready = name !== null && !clash && name !== initial && !pending;
  const close = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <Dialog isOpen onOpenChange={close} purpose="form" width={440}>
      <DialogHeader title={title} onOpenChange={close} />
      <form
        action={() => {
          if (ready) onSubmit(name);
        }}
      >
        {/* DialogHeader insets its title; the body takes the same inset so the two line up. */}
        <VStack gap={4} paddingInline={4} paddingBlockEnd={4}>
          <TextInput
            label="Folder name"
            value={value}
            onChange={setValue}
            hasAutoFocus
            autoComplete="off"
            description="One folder per kind of document, for example Receipts or Contracts."
            status={error ? { type: "error", message: error } : undefined}
          />
          <HStack justify="end" gap={2}>
            <Button label="Cancel" variant="secondary" onClick={onClose} />
            <Button label={submitLabel} type="submit" variant="primary" isDisabled={!ready} isLoading={pending} />
          </HStack>
        </VStack>
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
    return <NameForm title="New folder" initial="" taken={taken} submitLabel="Create folder" pending={create.isPending} onSubmit={(name) => create.mutate(name, done)} onClose={onClose} />;

  const { name, files } = dialog.folder;
  if (dialog.kind === "rename")
    return (
      <NameForm title={`Rename "${name}"`} initial={name} taken={taken} submitLabel="Rename folder" pending={rename.isPending} onSubmit={(next) => rename.mutate({ folder: name, name: next }, done)} onClose={onClose} />
    );

  const what = files === 0 ? "The folder is empty." : `Its ${files} file${files === 1 ? " leaves" : "s leave"} the app: text, page images, search index and uploaded copies.`;
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Delete folder "${name}"?`}
      description={`${what} Files added from a directory on this machine stay where they are. This cannot be undone.`}
      actionLabel="Delete folder"
      actionVariant="destructive"
      isActionLoading={remove.isPending}
      onAction={() => remove.mutate(name, done)}
    />
  );
}
