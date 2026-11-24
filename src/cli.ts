#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Config, loadConfig } from "./config";
import { openDb } from "./db";
import { folderConfig, folderStats, listFolders, removeFolder, renameFolder } from "./folders";
import { type Problem, SetupError, diagnose } from "./health";
import { addPath, processFile, resetFiles } from "./pipeline";
import { indexPending, search } from "./search";
import { startServer } from "./server";

const usage = `Usage:
  bun run serve                          start the web app (bun run dev: reloads as the code changes)
  bun run serve --tailnet                also answer on this computer's Tailscale name, to use it from a phone
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
    tailnet: { type: "boolean", default: false },
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

const say = (p: Problem) => `${p.title}. ${p.detail}${p.fix ? `\n  Run: ${p.fix}` : ""}`;

/** Stops before any work when the model the command needs is not there, with what to do about it. */
async function ready(...roles: Problem["id"][]) {
  const problems = (await diagnose(cfg)).filter((p) => roles.includes(p.id));
  for (const p of problems) console.error(say(p));
  if (problems.some((p) => p.level === "error")) process.exit(1);
}

/** This computer's name on the tailnet (machine.tailnet.ts.net) and how to call Tailscale; null when it is not connected. */
async function tailnet() {
  // The Mac app keeps its command inside the app, so it is often not on the PATH.
  const app = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
  const bin = Bun.which("tailscale") ? "tailscale" : existsSync(app) ? app : null;
  if (!bin) return null;
  const res = await $`${bin} status --json`.quiet().nothrow();
  try {
    const name = (JSON.parse(res.stdout.toString()).Self?.DNSName as string | undefined)?.replace(/\.$/, "");
    return name ? { name, bin } : null;
  } catch {
    return null;
  }
}

async function index(db: Db) {
  try {
    console.log(`search index: ${await indexPending(db, cfg.search)} file(s) added`);
  } catch (e) {
    // OCR results are safe; only the index is behind.
    console.error(`Search index skipped. ${e instanceof SetupError ? say(e.problem) : e instanceof Error ? e.message : e}\n  Then run: bun run index`);
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
      await ready("ocr", "pdf");
      const { db, folder } = openFolder(true);
      const files = [];
      for (const arg of args) files.push(...(await addPath(db, arg)));
      await ocr(db, folder, files);
      break;
    }
    case "redo": {
      await ready("ocr", "pdf");
      const { db, folder } = openFolder();
      resetFiles(db);
      const files = db.query("SELECT id, name FROM files ORDER BY id").all() as { id: number; name: string }[];
      await ocr(db, folder, files.map((f) => ({ ...f, done: false })));
      break;
    }
    case "index":
      await ready("search");
      await index(openFolder().db);
      break;
    case "search": {
      if (!args.length) die(usage);
      await ready("search");
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
      let phone = "";
      if (values.tailnet) {
        const ts = await tailnet();
        if (!ts) die("Tailscale is not connected on this computer. Open Tailscale and sign in, then run this again.");
        cfg.allowedHosts = [...cfg.allowedHosts, ts.name];
        phone = `\nFrom a phone on your tailnet: https://${ts.name}/\n  Turn the link on (once):  ${ts.bin} serve --bg ${cfg.port}\n  Turn it off:              ${ts.bin} serve reset`;
      }
      const { server } = await startServer(cfg, { dev: values.dev });
      console.log(`OCR app: ${server.url}${phone}`);
      for (const p of await diagnose(cfg)) console.error("\n" + say(p));
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
  // Errors meant for the person (bad folder name, folder busy, setup problems) are printed plainly; anything else is a bug.
  if (e instanceof SetupError) die(say(e.problem) + "\nFiles not read yet stay waiting: run the command again afterwards.");
  if (e instanceof Error && "status" in e) die(e.message);
  throw e;
}
