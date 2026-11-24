// Every read and every change goes through here: one cache, one place for errors and refreshes.
import { MutationCache, QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { type FileStatus, api } from "./api";
import { go } from "./route";
import { toast } from "./toast";

export const queryClient = new QueryClient({
  // Polling stops while the tab is in the background and picks up at once when it is looked at again.
  defaultOptions: { queries: { retry: false } },
  // A failed change is shown once, here, with the reason the server gave.
  mutationCache: new MutationCache({ onError: (e) => toast.bad(e.message) }),
});

const refresh = () => queryClient.invalidateQueries();
const TICK = 2000; // ponytail: polling; local server, small answers

export const useStatus = () => useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 5000 });
export const useFolders = () => useQuery({ queryKey: ["folders"], queryFn: api.folders, refetchInterval: TICK });
export const useFiles = (folder: string) =>
  useQuery({ queryKey: ["files", folder], queryFn: () => api.files(folder), refetchInterval: TICK });
/** Reloads while the file is still being read, so pages appear as they finish, and once more when its status changes. */
export const useFile = (folder: string, id: number, status: FileStatus) =>
  useQuery({
    queryKey: ["file", folder, id, status],
    queryFn: () => api.file(folder, id),
    refetchInterval: status === "queued" || status === "processing" ? TICK : false,
    placeholderData: (old) => old,
  });
export const useSearch = (folder: string, q: string) =>
  useQuery({ queryKey: ["search", folder, q], queryFn: () => api.search(folder, q) });

export const useCreateFolder = () =>
  useMutation({
    mutationFn: api.createFolder,
    onSuccess: async ({ name }) => {
      await refresh();
      toast.ok(`Folder "${name}" created`);
      go({ folder: name });
    },
  });

export const useRenameFolder = (current: string | null) =>
  useMutation({
    mutationFn: ({ folder, name }: { folder: string; name: string }) => api.renameFolder(folder, name),
    onSuccess: async ({ name }, { folder }) => {
      await refresh();
      toast.ok(`"${folder}" renamed to "${name}"`);
      if (current === folder) go({ folder: name });
    },
  });

export const useDeleteFolder = (current: string | null) =>
  useMutation({
    mutationFn: api.deleteFolder,
    onSuccess: async ({ deleted }) => {
      if (current === deleted) go({});
      await refresh();
      toast.ok(`Folder "${deleted}" deleted`);
    },
  });

export const useUpload = (folder: string) =>
  useMutation({
    mutationFn: (files: File[]) => api.upload(folder, files),
    onSuccess: ({ added, skipped }) => {
      refresh();
      if (added) toast.ok(`${added} file${added === 1 ? "" : "s"} added to ${folder}`);
      if (skipped.length) toast.bad(`Not added, type not supported: ${skipped.join(", ")}`);
    },
  });

export const useImportPath = (folder: string) =>
  useMutation({
    mutationFn: (path: string) => api.importPath(folder, path),
    onSuccess: ({ added }) => {
      refresh();
      toast.ok(added ? `${added} file${added === 1 ? "" : "s"} added to ${folder}` : "No PDFs or images found there");
    },
  });

export const useDeleteFile = (folder: string, openId: number | null) =>
  useMutation({
    mutationFn: (id: number) => api.deleteFile(folder, id),
    onSuccess: async ({ deleted }, id) => {
      if (openId === id) go({ folder });
      await refresh();
      toast.ok(`"${deleted}" deleted`);
    },
  });

export const useRedoFile = (folder: string) =>
  useMutation({
    mutationFn: (id: number) => api.redoFile(folder, id),
    onSuccess: () => {
      refresh();
      toast.ok("Reading the file again");
    },
  });
