// The one place the web app talks to the server.
export type FolderInfo = { name: string; files: number; done: number; failed: number; active: number };
export type FileStatus = "queued" | "processing" | "done" | "failed";
export type FileInfo = {
  id: number;
  name: string;
  status: FileStatus;
  page_count: number | null;
  pages_done: number;
  error: string | null;
};
export type Box = { type: string; box: [number, number, number, number]; text: string };
export type Page = { page: number; text: string; hasImage: boolean; boxes: Box[] };
export type FileDetail = { file: Omit<FileInfo, "pages_done">; pages: Page[] };
export type Hit = { file_id: number; name: string; page: number; text: string; score: number };
/** Something wrong with the setup (Ollama not running, model not downloaded, ...), with what to do about it. */
export type Problem = { id: "ocr" | "search" | "pdf" | "index"; level: "error" | "warning"; title: string; detail: string; fix?: string };
/** waiting: files not read yet. paused: a problem is holding them. search: whether search is turned on. */
export type Status = { waiting: number; paused: boolean; search: boolean; problems: Problem[] };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch("/api" + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body as T;
}

const at = (folder: string) => "/folders/" + encodeURIComponent(folder);
const send = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { "content-type": "application/json" } }),
});

export const api = {
  status: () => call<Status>("/status"),
  folders: () => call<{ folders: FolderInfo[]; searchEnabled: boolean }>("/folders"),
  createFolder: (name: string) => call<{ name: string }>("/folders", send("POST", { name })),
  renameFolder: (folder: string, name: string) => call<{ name: string }>(at(folder), send("PATCH", { name })),
  deleteFolder: (folder: string) => call<{ deleted: string }>(at(folder), send("DELETE")),
  files: (folder: string) => call<{ files: FileInfo[] }>(at(folder) + "/files"),
  upload: (folder: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return call<{ added: number; skipped: string[] }>(at(folder) + "/files", { method: "POST", body: form });
  },
  importPath: (folder: string, path: string) => call<{ added: number }>(at(folder) + "/import", send("POST", { path })),
  file: (folder: string, id: number) => call<FileDetail>(`${at(folder)}/files/${id}`),
  deleteFile: (folder: string, id: number) => call<{ deleted: string }>(`${at(folder)}/files/${id}`, send("DELETE")),
  redoFile: (folder: string, id: number) => call<{ queued: number }>(`${at(folder)}/files/${id}/redo`, send("POST")),
  search: (folder: string, q: string) => call<{ results: Hit[] }>(`${at(folder)}/search?q=${encodeURIComponent(q)}`),
  imageUrl: (folder: string, id: number, page: number) => `/api${at(folder)}/files/${id}/pages/${page}/image`,
};
