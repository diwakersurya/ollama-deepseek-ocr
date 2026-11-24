import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Config } from "./config";
import { openDb } from "./db";
import { fail } from "./errors";
import { folderConfig, folderStats, listFolders, removeFolder, renameFolder } from "./folders";
import { type Problem, SetupError, diagnose } from "./health";
import { SUPPORTED, addFile, addPath, deleteFile, processFile, resetFiles } from "./pipeline";
import { indexPending, search } from "./search";
import { folderName } from "./shared/schema";
import app from "./web/index.html";

/**
 * Who may call the API. The request must be addressed to this computer by a name we know: its own
 * (localhost) or one listed in allowedHosts, such as its tailnet name. That blocks DNS rebinding.
 * A request made by another website carries that site's Origin and is refused.
 */
export function allowed(req: Request, extraHosts: readonly string[] = []) {
  const url = new URL(req.url);
  if (!["localhost", "127.0.0.1", ...extraHosts].includes(url.hostname)) return false;
  const origin = req.headers.get("origin");
  if (!origin || origin === url.origin) return true;
  // Behind "tailscale serve" the page is https on the tailnet name while we are reached as plain http.
  try {
    return extraHosts.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

type Folder = { db: Database; cfg: Config };

/** retryMs: how long to wait before trying again while a setup problem stops the reading. */
export async function startServer(cfg: Config, { dev = false, retryMs = 10_000 } = {}) {
  const opened = new Map<string, Folder>();
  /** The folder's own database and settings. Unknown folder: 404, unless `create`. */
  const open = (name: string, create = false) => {
    const folderCfg = folderConfig(cfg, name);
    if (!create && !existsSync(folderCfg.dataDir)) {
      close(name);
      throw fail(404, `no folder "${name}"`);
    }
    let folder = opened.get(name);
    if (!folder) opened.set(name, (folder = { db: openDb(folderCfg.dataDir), cfg: folderCfg }));
    return folder;
  };
  const close = (name: string) => {
    opened.get(name)?.db.close();
    opened.delete(name);
  };

  // One file at a time across all folders (one model), in the order added.
  let queue: Promise<unknown> = Promise.resolve();
  let waiting = 0;
  let stopped = false;
  let paused: Problem | null = null; // a setup problem is holding the queue
  let indexProblem: Problem | null = null; // files were read but could not be made searchable

  /** Reads one file. While the setup is broken the file keeps waiting and we try again: nothing is marked failed. */
  const read = async ({ db, cfg: folderCfg }: Folder, id: number) => {
    while (!stopped) {
      try {
        await processFile(db, folderCfg, id);
        paused = null;
        return;
      } catch (e) {
        if (!(e instanceof SetupError)) throw e;
        paused = e.problem;
        await Bun.sleep(retryMs);
      }
    }
  };
  const index = async ({ db }: Folder) => {
    if (!cfg.search.enabled || stopped) return;
    try {
      await indexPending(db, cfg.search);
      indexProblem = null;
    } catch (e) {
      // The text is safe; only search is behind. It catches up on the next file or on "bun run index".
      indexProblem = e instanceof SetupError ? e.problem : { id: "index", level: "warning", title: "Search is behind", detail: e instanceof Error ? e.message : String(e), fix: "bun run index" };
    }
  };
  const enqueue = (folder: Folder, id: number) => {
    waiting++;
    queue = queue
      .then(() => read(folder, id))
      .then(() => index(folder))
      .catch((e) => console.error("queue:", e instanceof Error ? e.message : e))
      .finally(() => waiting--);
  };
  // Files left unfinished by the last run.
  for (const name of await listFolders(cfg)) {
    const folder = open(name);
    const rows = folder.db.query("SELECT id FROM files WHERE status IN ('queued', 'processing') ORDER BY id").all();
    for (const { id } of rows as { id: number }[]) enqueue(folder, id);
  }

  // ponytail: the setup is checked at most every 5 s, however many tabs ask.
  let checked = 0;
  let found: Problem[] = [];
  const status = async () => {
    if (Date.now() - checked > 5000) {
      checked = Date.now();
      found = await diagnose(cfg);
    }
    // What stopped the queue is the most exact account of a problem, so it comes first; one line per problem.
    const problems = [paused, indexProblem, ...found].filter((p, i, all): p is Problem => p !== null && all.findIndex((o) => o?.id === p.id) === i);
    return { waiting, paused: paused !== null, search: cfg.search.enabled, problems };
  };

  type Req = Bun.BunRequest<any>;
  const api = (handler: (req: Req) => Response | Promise<Response>) => async (req: Req) => {
    if (!allowed(req, cfg.allowedHosts)) return json({ error: "forbidden" }, 403);
    try {
      return await handler(req);
    } catch (e) {
      const status = e instanceof SetupError ? 503 : ((e as { status?: number }).status ?? 500);
      return json({ error: e instanceof Error ? e.message : String(e) }, status);
    }
  };
  const fileId = (req: Req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw fail(400, "bad id");
    return id;
  };
  const newName = async (req: Req) => {
    const parsed = folderName.safeParse(((await req.json()) as { name?: unknown }).name);
    if (!parsed.success) throw fail(400, parsed.error.issues[0]!.message);
    return parsed.data;
  };

  const server = Bun.serve({
    hostname: cfg.host, // 127.0.0.1 unless config.json says otherwise: not reachable from the network
    port: cfg.port,
    development: dev,
    maxRequestBodySize: 2 * 1024 ** 3,
    routes: {
      "/": app,
      "/api/status": { GET: api(async () => json(await status())) },
      "/api/folders": {
        GET: api(async () =>
          json({
            searchEnabled: cfg.search.enabled,
            folders: (await listFolders(cfg)).map((name) => ({ name, ...folderStats(open(name).db) })),
          }),
        ),
        POST: api(async (req) => {
          const name = await newName(req);
          if (existsSync(folderConfig(cfg, name).dataDir)) throw fail(409, `a folder named "${name}" already exists`);
          open(name, true);
          return json({ name });
        }),
      },
      "/api/folders/:folder": {
        PATCH: api(async (req) => {
          const name = await newName(req);
          close(req.params.folder!);
          close(name);
          await renameFolder(cfg, req.params.folder!, name);
          return json({ name });
        }),
        DELETE: api(async (req) => {
          close(req.params.folder!);
          await removeFolder(cfg, req.params.folder!);
          return json({ deleted: req.params.folder! });
        }),
      },
      "/api/folders/:folder/files": {
        GET: api((req) =>
          json({
            files: open(req.params.folder!)
              .db.query(
                `SELECT id, name, status, page_count, error, created_at,
                        (SELECT COUNT(*) FROM pages p WHERE p.file_id = f.id) AS pages_done
                 FROM files f ORDER BY id DESC`,
              )
              .all(),
          }),
        ),
        POST: api(async (req) => {
          const folder = open(req.params.folder!);
          const uploads = join(folder.cfg.dataDir, "uploads");
          const form = await req.formData();
          await mkdir(uploads, { recursive: true });
          let added = 0;
          const skipped: string[] = [];
          for (const f of form.getAll("files")) {
            if (!(f instanceof File)) continue;
            const name = basename(f.name);
            if (!SUPPORTED.test(name)) {
              skipped.push(name);
              continue;
            }
            const dest = join(uploads, crypto.randomUUID() + extname(name).toLowerCase());
            await Bun.write(dest, f);
            const row = await addFile(folder.db, dest, name);
            if (row.path !== dest) await rm(dest); // same content already in this folder
            if (!row.done) enqueue(folder, row.id);
            added++;
          }
          return json({ added, skipped });
        }),
      },
      // Adds every supported file under a directory on this machine.
      "/api/folders/:folder/import": {
        POST: api(async (req) => {
          const folder = open(req.params.folder!);
          const { path } = (await req.json()) as { path?: unknown };
          if (typeof path !== "string" || !path.trim()) throw fail(400, "path is required");
          const info = await stat(path.trim()).catch(() => null);
          if (!info?.isDirectory()) throw fail(400, `not a directory: ${path}`);
          const rows = await addPath(folder.db, path.trim());
          for (const row of rows) if (!row.done) enqueue(folder, row.id);
          return json({ added: rows.length });
        }),
      },
      "/api/folders/:folder/files/:id": {
        GET: api((req) => {
          const { db } = open(req.params.folder!);
          const id = fileId(req);
          const file = db.query("SELECT id, name, status, page_count, error, out_path FROM files WHERE id = ?").get(id);
          if (!file) throw fail(404, "no such file");
          const pages = db.query("SELECT page, text, image, boxes FROM pages WHERE file_id = ? ORDER BY page").all(id) as {
            page: number;
            text: string;
            image: string | null;
            boxes: string | null;
          }[];
          return json({
            file,
            pages: pages.map((p) => ({ page: p.page, text: p.text, hasImage: !!p.image, boxes: JSON.parse(p.boxes ?? "[]") })),
          });
        }),
        DELETE: api(async (req) => {
          const folder = open(req.params.folder!);
          const file = await deleteFile(folder.db, folder.cfg, fileId(req));
          return json({ deleted: file.name });
        }),
      },
      // Read the file again from scratch.
      "/api/folders/:folder/files/:id/redo": {
        POST: api((req) => {
          const folder = open(req.params.folder!);
          const id = fileId(req);
          if (!folder.db.query("SELECT 1 FROM files WHERE id = ?").get(id)) throw fail(404, "no such file");
          resetFiles(folder.db, id);
          enqueue(folder, id);
          return json({ queued: id });
        }),
      },
      "/api/folders/:folder/files/:id/pages/:page/image": {
        GET: api(async (req) => {
          const folder = open(req.params.folder!);
          const id = fileId(req);
          const page = Number(req.params.page);
          if (!Number.isInteger(page)) throw fail(400, "bad page");
          // The file name comes from the database, never from the request.
          const row = folder.db.query("SELECT image FROM pages WHERE file_id = ? AND page = ?").get(id, page) as {
            image: string | null;
          } | null;
          const image = row?.image ? Bun.file(join(folder.cfg.dataDir, "pages", String(id), row.image)) : null;
          if (!image || !(await image.exists())) throw fail(404, "no such page");
          return new Response(image);
        }),
      },
      "/api/folders/:folder/search": {
        GET: api(async (req) => {
          const { db } = open(req.params.folder!);
          if (!cfg.search.enabled) throw fail(400, "search is turned off in config.json");
          const q = new URL(req.url).searchParams.get("q")?.trim();
          if (!q) throw fail(400, "q is required");
          return json({ results: await search(db, cfg.search, q) });
        }),
      },
    },
    fetch: () => json({ error: "not found" }, 404),
  });

  return {
    server,
    idle: () => queue,
    stop: () => {
      stopped = true;
      return server.stop(true);
    },
  };
}
