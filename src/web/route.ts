// Where the person is, kept in the address so a reload, the back button or a shared link works:
//   #/Receipts            a folder
//   #/Receipts/file/12    a file (optionally /3 for a page)
//   #/Receipts/search/x   search results
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { folderName } from "../shared/schema";
import { toast } from "./toast";

export type Route = { folder: string | null; fileId: number | null; page: number | null; q: string | null };

const NOWHERE: Route = { folder: null, fileId: null, page: null, q: null };
const positive = z.coerce.number().int().positive();
const query = z.string().trim().min(1).max(200);

/** The address is typed by people and pasted from anywhere, so every part is checked. */
export function parse(hash: string): Route | null {
  let parts: string[];
  try {
    parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (!parts.length) return NOWHERE;
  const folder = folderName.safeParse(parts[0]);
  if (!folder.success) return null;
  const route = { ...NOWHERE, folder: folder.data };
  if (parts.length === 1) return route;
  if (parts[1] === "file" && parts.length <= 4) {
    const id = positive.safeParse(parts[2]);
    const page = parts[3] === undefined ? null : positive.safeParse(parts[3]);
    if (!id.success || (page && !page.success)) return null;
    return { ...route, fileId: id.data, page: page ? page.data! : null };
  }
  if (parts[1] === "search" && parts.length === 3) {
    const q = query.safeParse(parts[2]);
    return q.success ? { ...route, q: q.data } : null;
  }
  return null;
}

export function format({ folder, fileId, page, q }: Partial<Route>) {
  if (!folder) return "";
  const base = "#/" + encodeURIComponent(folder);
  if (fileId) return `${base}/file/${fileId}${page ? "/" + page : ""}`;
  return q ? `${base}/search/${encodeURIComponent(q)}` : base;
}

function read() {
  const route = parse(location.hash);
  if (route) return route;
  // A bad link is said out loud and removed, so the person is not left on a broken address.
  history.replaceState(null, "", location.pathname);
  toast.bad("That link is not valid. Showing your folders instead.");
  return NOWHERE;
}

let current = read();
const listeners = new Set<() => void>();
window.addEventListener("hashchange", () => {
  current = read();
  listeners.forEach((l) => l());
});

export const useRoute = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );

export function go(route: Partial<Route>) {
  const hash = format(route);
  if (hash) location.hash = hash;
  else {
    history.pushState(null, "", location.pathname);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}
