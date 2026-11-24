#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Config, loadConfig } from "./config";
import { openDb } from "./db";
import { folderConfig, folderStats, listFolders, removeFolder, renameFolder } from "./folders";
import { addPath, processFile, resetFiles } from "./pipeline";
import { indexPending, search } from "./search";
import { startServer } from "./server";

const usage = `Usage:
  bun run serve                          start the web app (bun run dev: reloads as the code changes)
  bun run ocr <file|directory>...        OCR files (directories are scanned recursively), then index them for search
  bun run redo                           OCR every file of the folder again (after a change of model, prompt or pdfDpi)
  bun run index                          index OCR'd files for search (only those not indexed yet)
  bun run search <query>                 search the OCR'd text
  bun run folders                        list the folders
  bun run folders rename <from> <to>     rename a folder
  bun run folders delete <name> --yes    delete a folder and everything the app keeps in it
  bun run config                         print the settings in use

  -f, --folder <name>   which folder ocr, redo, index and search work in (default: "default").
                        Each folder keeps its documents and its search apart; ocr creates it.`;

function die(message: string): never {
  console.error(message);
  process.exit(2);
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    folder: { type: "string", short: "f", default: "default" },
    yes: { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
  },
  allowPositionals: true,
});
const [cmd, ...args] = positionals;
const cfg = await loadConfig();
type Db = ReturnType<typeof openDb>;

/** Settings and database of the chosen folder. Only `ocr` may create a folder. */
function openFolder(create = false) {
  const folder = folderConfig(cfg, values.folder);
  if (!create && !existsSync(folder.dataDir)) die(`no folder "${values.folder}" (see: bun run folders)`);
  return { folder, db: openDb(folder.dataDir) };
}

async function index(db: Db) {
  try {
    console.log(`search index: ${await indexPending(db, cfg.search)} file(s) added`);
  } catch (e) {
    // OCR results are safe; only the index is behind.
    console.error(`search index skipped: ${e instanceof Error ? e.message : e}\n  run "bun run index" when the embedding model is up`);
  }
}

async function ocr(db: Db, folder: Config, files: { id: number; name: string; done: boolean }[]) {
  let failed = 0;
  for (const [n, f] of files.entries()) {
    const tag = `[${n + 1}/${files.length}] ${f.name}`;
    if (f.done) {
      console.log(`${tag}: already done, skipped`);
      continue;
    }
    const row = await processFile(db, folder, f.id, (page, total) => {
      if (process.stdout.isTTY) process.stdout.write(`\r${tag}: page ${page}/${total}`);
    });
    if (process.stdout.isTTY) process.stdout.write("\r\x1b[K");
    if (row?.status === "done") console.log(`${tag}: ${row.page_count} page(s) -> ${row.out_path}`);
    else {
      failed++;
      console.error(`${tag}: FAILED: ${row?.error ?? "deleted meanwhile"}`);
    }
  }
  if (cfg.search.enabled) await index(db);
  console.log(`${files.length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

try {
  switch (cmd) {
    case "ocr": {
      if (!args.length) die(usage);
      const { db, folder } = openFolder(true);
      const files = [];
      for (const arg of args) files.push(...(await addPath(db, arg)));
      await ocr(db, folder, files);
      break;
    }
    case "redo": {
      const { db, folder } = openFolder();
      resetFiles(db);
      const files = db.query("SELECT id, name FROM files ORDER BY id").all() as { id: number; name: string }[];
      await ocr(db, folder, files.map((f) => ({ ...f, done: false })));
      break;
    }
    case "index":
      await index(openFolder().db);
      break;
    case "search": {
      if (!args.length) die(usage);
      for (const r of await search(openFolder().db, cfg.search, args.join(" ")))
        console.log(`${r.score.toFixed(3)}  ${r.name}  p.${r.page}\n    ${r.text.replace(/\s+/g, " ").slice(0, 200)}`);
      break;
    }
    case "folders": {
      const [action, a, b] = args;
      if (action === "rename" && a && b) {
        await renameFolder(cfg, a, b);
        console.log(`renamed "${a}" to "${b}"`);
      } else if (action === "delete" && a) {
        const { files } = folderStats(openDb(folderConfig(cfg, a).dataDir));
        if (!values.yes) die(`this deletes folder "${a}" with ${files} file(s): text, page images, uploaded copies. Add --yes to do it.`);
        await removeFolder(cfg, a);
        console.log(`deleted "${a}"`);
      } else if (!action) {
        for (const name of await listFolders(cfg)) {
          const s = folderStats(openDb(folderConfig(cfg, name).dataDir));
          console.log(`${name}\t${s.files} file(s)${s.failed ? `, ${s.failed} failed` : ""}${s.active ? `, ${s.active} waiting` : ""}`);
        }
      } else die(usage);
      break;
    }
    case "serve": {
      const { server } = await startServer(cfg, { dev: values.dev });
      console.log(`OCR app: ${server.url}`);
      break;
    }
    case "config":
      console.log(JSON.stringify(cfg, null, 2));
      break;
    default:
      console.error(usage);
      process.exit(cmd ? 2 : 0);
  }
} catch (e) {
  // Errors meant for the person (bad folder name, folder busy, ...) carry a status; anything else is a bug.
  if (e instanceof Error && "status" in e) die(e.message);
  throw e;
}
