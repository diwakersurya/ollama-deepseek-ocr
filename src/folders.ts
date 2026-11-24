// A folder keeps one kind of document apart from the others: it is its own directory
// (<dataDir>/folders/<name>) with its own database, uploads, page images, markdown and search index.
import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
import { join, sep } from "node:path";
import type { Config } from "./config";
import { openDb } from "./db";
import { fail } from "./errors";
import { folderName } from "./shared/schema";

/** The settings to use inside a folder. A name that could leave the data directory is refused. */
export function folderConfig(cfg: Config, name: string): Config {
  const parsed = folderName.safeParse(name);
  if (!parsed.success) throw fail(400, `bad folder name "${name}": ${parsed.error.issues[0]!.message}`);
  return { ...cfg, dataDir: join(cfg.dataDir, "folders", parsed.data) };
}

export async function listFolders(cfg: Config) {
  const entries = await readdir(join(cfg.dataDir, "folders"), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((d) => d.isDirectory() && folderName.safeParse(d.name).success)
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export type FolderStats = { files: number; done: number; failed: number; active: number };

export function folderStats(db: Database) {
  return db
    .query(
      `SELECT COUNT(*) AS files,
              COALESCE(SUM(status = 'done'), 0) AS done,
              COALESCE(SUM(status = 'failed'), 0) AS failed,
              COALESCE(SUM(status IN ('queued', 'processing')), 0) AS active
       FROM files`,
    )
    .get() as FolderStats;
}

/** The folder's directory, once it is known to exist and to have no file waiting or being read. */
function idleDir(cfg: Config, name: string, action: string) {
  const dir = folderConfig(cfg, name).dataDir;
  if (!existsSync(dir)) throw fail(404, `no folder "${name}"`);
  const db = openDb(dir);
  const { active } = folderStats(db);
  db.close();
  if (active) throw fail(409, `"${name}" still has ${active} file(s) being read. ${action} it when they finish.`);
  return dir;
}

/** Callers that keep a database open on the folder must close it first. */
export async function renameFolder(cfg: Config, from: string, to: string) {
  const a = idleDir(cfg, from, "Rename");
  const b = folderConfig(cfg, to).dataDir;
  if (a === b) return;
  // ponytail: lower-case compare lets "receipts" become "Receipts" on macOS (case-insensitive disk).
  if (existsSync(b) && a.toLowerCase() !== b.toLowerCase()) throw fail(409, `a folder named "${to.trim()}" already exists`);
  await rename(a, b);
  // Uploaded copies and markdown live inside the folder, so their stored paths move with it.
  const db = openDb(b);
  for (const col of ["path", "out_path"])
    db.run(`UPDATE files SET ${col} = ?2 || substr(${col}, length(?1) + 1) WHERE substr(${col}, 1, length(?1)) = ?1`, [
      a + sep,
      b + sep,
    ]);
  db.close();
}

/** Deletes the folder and everything the app keeps in it. Files that were imported from disk stay where they are. */
export async function removeFolder(cfg: Config, name: string) {
  await rm(idleDir(cfg, name, "Delete"), { recursive: true, force: true });
}
