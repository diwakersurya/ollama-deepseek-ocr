// File -> page images -> OCR model -> SQLite + markdown file.
// Shared by the CLI and the server. Knows nothing about search.
import { $ } from "bun";
import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import type { Config } from "./config";
import { fail } from "./errors";

export const SUPPORTED = /\.(pdf|png|jpe?g|webp|heic|heif|tiff?|gif|bmp)$/i;
const SENT_AS_IS = /\.(png|jpe?g|webp)$/i;

export type FileRow = {
  id: number;
  hash: string;
  path: string;
  name: string;
  status: "queued" | "processing" | "done" | "failed";
  page_count: number | null;
  out_path: string | null;
  error: string | null;
  indexed_model: string | null;
};

/** Removes DeepSeek OCR layout marks (<|ref|>type<|/ref|><|det|>[[box]]<|/det|>, or `type[[box]]` as Ollama returns them) and keeps the text. */
export function cleanOcr(text: string) {
  return text
    .replace(/<\|ref\|>[\s\S]*?<\|\/ref\|>/g, "")
    .replace(/<\|det\|>[\s\S]*?<\|\/det\|>/g, "")
    .replace(/^\w+\[\[[\d, ]+\]\]$/gm, "")
    .replace(/\n\s*\*{1,2}\s*$/, "") // the model sometimes ends a page with a lone "*"
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type Box = { type: string; box: [number, number, number, number]; text: string };

/**
 * Reads the layout answer: a mark line (`title[[x1, y1, x2, y2]]`, or the tagged form
 * <|ref|>title<|/ref|><|det|>[[...]]<|/det|>) followed by that section's text.
 * Coordinates are 0..999 of the page width and height.
 */
export function parseBoxes(raw: string) {
  const boxes: Box[] = [];
  let open: Box[] = [];
  const lines = raw.replace(/<\|ref\|>(.*?)<\|\/ref\|><\|det\|>(.*?)<\|\/det\|>/g, "\n$1$2\n").split("\n");
  for (const line of lines) {
    const mark = line.trim().match(/^(\w+)(\[\[[\d,\s\[\]]+\]\])$/);
    if (!mark) {
      for (const b of open) b.text = (b.text + "\n" + line).trim();
      continue;
    }
    let coords: unknown = [];
    try {
      coords = JSON.parse(mark[2]!);
    } catch {}
    open = (Array.isArray(coords) ? coords : [])
      .filter((c): c is number[] => Array.isArray(c) && c.length === 4 && c.every((n) => Number.isFinite(n)))
      .map((c) => ({ type: mark[1]!, box: c.map((n) => Math.min(999, Math.max(0, n))) as Box["box"], text: "" }));
    boxes.push(...open);
  }
  return boxes;
}

async function sha256(path: string) {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

/** Registers one file. Content already seen is not added again. */
export async function addFile(db: Database, path: string, name = basename(path)) {
  path = resolve(path);
  const hash = await sha256(path);
  const old = db.query("SELECT * FROM files WHERE hash = ?").get(hash) as FileRow | null;
  if (!old) {
    const { lastInsertRowid } = db.run("INSERT INTO files (hash, path, name) VALUES (?, ?, ?)", [hash, path, name]);
    return { id: Number(lastInsertRowid), name, path, done: false };
  }
  if (old.status !== "done") {
    // Unfinished file that moved since last time: follow it. A failed one gets another try.
    if (!existsSync(old.path)) db.run("UPDATE files SET path = ?, name = ? WHERE id = ?", [path, name, old.id]);
    if (old.status === "failed") db.run("UPDATE files SET status = 'queued', error = NULL WHERE id = ?", [old.id]);
  }
  const row = db.query("SELECT * FROM files WHERE id = ?").get(old.id) as FileRow;
  return { id: row.id, name: row.name, path: row.path, done: row.status === "done" };
}

/** Registers a file, or every supported file under a folder (recursive). */
export async function addPath(db: Database, input: string) {
  input = resolve(input);
  if (!(await stat(input)).isDirectory()) {
    if (!SUPPORTED.test(input)) throw new Error(`unsupported file type: ${input}`);
    return [await addFile(db, input)];
  }
  const found = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: input, onlyFiles: true }));
  const added = [];
  for (const rel of found.filter((f) => SUPPORTED.test(f)).sort())
    added.push(await addFile(db, join(input, rel), join(basename(input), rel)));
  return added;
}

async function run(what: string, cmd: ReturnType<typeof $>) {
  const res = await cmd.quiet().nothrow();
  if (res.exitCode !== 0)
    throw new Error(`${what} could not read the file: ${(res.stdout.toString() + res.stderr.toString()).trim().split("\n")[0]!.slice(0, 200)}`);
}

/** Puts one image per page in `dir` and returns their file names. They are kept: the web app shows them. */
async function toPageImages(path: string, dir: string, dpi: number) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  if (/\.pdf$/i.test(path)) {
    // -dSAFER: the PDF cannot read or write any file but itself and the output.
    await run(
      "ghostscript (gs)",
      $`gs -dSAFER -dBATCH -dNOPAUSE -q -sDEVICE=png16m ${"-r" + dpi} -dTextAlphaBits=4 -dGraphicsAlphaBits=4 ${"-sOutputFile=" + join(dir, "%05d.png")} ${path}`,
    );
  } else if (SENT_AS_IS.test(path)) {
    await Bun.write(join(dir, "00001" + extname(path).toLowerCase()), Bun.file(path));
  } else {
    // ponytail: macOS built-in converter for HEIC/TIFF/GIF/BMP, first frame only. Other OS: add a converter here.
    await run("sips", $`sips -s format png ${path} --out ${join(dir, "00001.png")}`);
  }
  return (await readdir(dir)).sort();
}

async function ask(image: string, ocr: Config["ocr"], prompt: string) {
  const file = Bun.file(image);
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const res = await fetch(`${ocr.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(ocr.timeoutMs),
    body: JSON.stringify({
      model: ocr.model,
      temperature: 0,
      max_tokens: ocr.maxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${file.type};base64,${data}` } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OCR server ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = (await res.json()) as { choices: { message: { content: string | null } }[] };
  return json.choices[0]?.message.content ?? "";
}

/**
 * OCRs one registered file. Never throws for a bad file: the failure is stored on the row,
 * so a bulk run goes on. Pages already stored are kept, so a crashed run resumes mid-PDF.
 */
export async function processFile(
  db: Database,
  cfg: Config,
  id: number,
  onPage?: (done: number, total: number) => void,
) {
  const get = () => db.query("SELECT * FROM files WHERE id = ?").get(id) as FileRow | null;
  const file = get();
  if (!file) return null; // deleted while it waited
  if (file.status === "done") return file;

  db.run("UPDATE files SET status = 'processing', error = NULL WHERE id = ?", [id]);
  try {
    const outDir = resolve(cfg.dataDir, "out");
    const outPath = resolve(outDir, file.name + ".md");
    if (!outPath.startsWith(outDir + sep)) throw new Error(`bad file name: ${file.name}`);

    const dir = join(cfg.dataDir, "pages", String(id));
    const images = await toPageImages(file.path, dir, cfg.pdfDpi);
    db.run("UPDATE files SET page_count = ? WHERE id = ?", [images.length, id]);
    const stored = new Set(
      (db.query("SELECT page FROM pages WHERE file_id = ?").all(id) as { page: number }[]).map((p) => p.page),
    );
    // ponytail: one page at a time; a 3B model on a laptop has no room for parallel runs.
    for (const [i, image] of images.entries()) {
      if (!stored.has(i + 1)) {
        const path = join(dir, image);
        // Section marks are an extra: if that read fails, the page text is still kept.
        const boxes = cfg.ocr.layoutPrompt ? parseBoxes(await ask(path, cfg.ocr, cfg.ocr.layoutPrompt).catch(() => "")) : [];
        const text = cleanOcr(await ask(path, cfg.ocr, cfg.ocr.prompt));
        db.run("INSERT INTO pages (file_id, page, text, image, boxes) VALUES (?, ?, ?, ?, ?)", [
          id,
          i + 1,
          text,
          image,
          JSON.stringify(boxes),
        ]);
      }
      onPage?.(i + 1, images.length);
    }

    const pages = db.query("SELECT text FROM pages WHERE file_id = ? ORDER BY page").all(id) as { text: string }[];
    await mkdir(dirname(outPath), { recursive: true });
    await Bun.write(outPath, pages.map((p) => p.text).join("\n\n---\n\n") + "\n");
    db.run("UPDATE files SET status = 'done', out_path = ?, done_at = CURRENT_TIMESTAMP WHERE id = ?", [outPath, id]);
  } catch (e) {
    db.run("UPDATE files SET status = 'failed', error = ? WHERE id = ?", [e instanceof Error ? e.message : String(e), id]);
  }
  return get();
}

const inside = (path: string, dir: string) => resolve(path).startsWith(resolve(dir) + sep);

/**
 * Removes a file from its folder: database rows (pages and search index go with it), page images,
 * markdown, and the uploaded copy. A file that was imported from disk is left where it is.
 */
export async function deleteFile(db: Database, cfg: Config, id: number) {
  const file = db.query("SELECT * FROM files WHERE id = ?").get(id) as FileRow | null;
  if (!file) throw fail(404, "no such file");
  if (file.status === "processing") throw fail(409, `"${file.name}" is being read now. Delete it when it finishes.`);
  db.run("DELETE FROM files WHERE id = ?", [id]);
  await rm(join(cfg.dataDir, "pages", String(id)), { recursive: true, force: true });
  if (file.out_path && inside(file.out_path, join(cfg.dataDir, "out"))) await rm(file.out_path, { force: true });
  if (inside(file.path, join(cfg.dataDir, "uploads"))) await rm(file.path, { force: true });
  return file;
}

/** Forgets what was read from a file (or from every file), so it is read again. */
export function resetFiles(db: Database, id?: number) {
  const busy = db.query("SELECT name FROM files WHERE status = 'processing' AND (?1 IS NULL OR id = ?1)").get(id ?? null) as { name: string } | null;
  if (busy) throw fail(409, `"${busy.name}" is being read now`);
  db.transaction(() => {
    db.run("DELETE FROM pages WHERE ?1 IS NULL OR file_id = ?1", [id ?? null]);
    db.run("DELETE FROM chunks WHERE ?1 IS NULL OR file_id = ?1", [id ?? null]);
    db.run("UPDATE files SET status = 'queued', error = NULL, indexed_model = NULL, done_at = NULL WHERE ?1 IS NULL OR id = ?1", [id ?? null]);
  })();
}
