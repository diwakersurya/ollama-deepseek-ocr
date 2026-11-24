// One check for the whole flow, against a stand-in model server (no real model needed).
// Needs Ghostscript (gs) to build and read the sample PDF.
import { $ } from "bun";
import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { defaults } from "../src/config";
import { openDb } from "../src/db";
import { folderConfig, listFolders, removeFolder, renameFolder } from "../src/folders";
import { addPath, cleanOcr, deleteFile, parseBoxes, processFile, resetFiles } from "../src/pipeline";
import { chunk, indexPending, search } from "../src/search";
import { allowed, startServer } from "../src/server";

const tmp = await mkdtemp(join(tmpdir(), "ocr-test-"));
afterAll(() => rm(tmp, { recursive: true, force: true }));

// Stand-in for Ollama: "reads" page 1 as a receipt and page 2 as a returns note.
const pagesText = [
  "<|ref|>title<|/ref|><|det|>[[10, 10, 500, 60]]<|/det|>\n# Corner Cafe\n\nAlmond croissant 4.50\n\nTOTAL 22.68",
  "<|ref|>text<|/ref|><|det|>[[10, 10, 500, 60]]<|/det|>\nReturns accepted within thirty days.",
];
let ocrCalls = 0;
const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];
const model = Bun.serve({
  port: 0,
  routes: {
    "/v1/chat/completions": {
      POST: async (req) => {
        const body = (await req.json()) as any;
        const layout = body.messages[0].content[1].text.includes("grounding");
        const content = layout ? "title[[100, 50, 600, 90]]\n# Corner Cafe\n\ntable[[100, 120, 400, 300]]\n<table>rows</table>" : pagesText[ocrCalls++ % 2];
        return Response.json({ choices: [{ message: { content } }] });
      },
    },
    "/v1/models": { GET: () => Response.json({ data: [{ id: "something-else" }] }) },
    "/v1/embeddings": {
      POST: async (req) => {
        const { input } = (await req.json()) as { input: string[] };
        // Bag of words hashed into 64 slots: shared words = similar vectors.
        const data = input.map((text) => {
          const embedding = new Array(64).fill(0);
          for (const w of words(text)) embedding[Number(Bun.hash(w) % 64n)] += 1;
          return { embedding };
        });
        return Response.json({ data });
      },
    },
  },
});
afterAll(() => model.stop(true));

const base = `http://127.0.0.1:${model.port}/v1`;
const cfg = {
  ...defaults,
  port: 0,
  dataDir: join(tmp, "data"),
  ocr: { ...defaults.ocr, baseUrl: base },
  search: { ...defaults.search, baseUrl: base, docPrefix: "", queryPrefix: "" },
};

async function samplePdf(dir: string, name: string, lines: string[]) {
  const ps = lines.map((l) => `/Helvetica findfont 14 scalefont setfont 72 700 moveto (${l}) show showpage`).join("\n");
  await Bun.write(join(dir, name + ".ps"), "%!PS\n" + ps + "\n");
  await $`gs -dSAFER -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite ${"-sOutputFile=" + join(dir, name)} ${join(dir, name + ".ps")}`.quiet();
  await rm(join(dir, name + ".ps"));
}

test("cleanOcr strips layout tags and keeps the text", () => {
  expect(cleanOcr(pagesText[1]!)).toBe("Returns accepted within thirty days.");
  expect(cleanOcr("| **TOTAL** | **22.68** |\n\n*")).toBe("| **TOTAL** | **22.68** |");
  expect(cleanOcr("sub_title[[113, 64, 572, 95]]\n## Cafe\n\ntext[[1, 2, 3, 4]]\nDate [[not a box]]")).toBe("## Cafe\n\nDate [[not a box]]");
});

test("parseBoxes reads marks in both forms and ignores text that only looks like one", () => {
  const want: unknown = [
    { type: "title", box: [100, 50, 600, 90], text: "# Cafe" },
    { type: "text", box: [1, 2, 3, 999], text: "Date [[1, 2, 3, 4]] here" },
  ];
  expect<unknown>(parseBoxes("title[[100, 50, 600, 90]]\n# Cafe\n\ntext[[1, 2, 3, 4000]]\nDate [[1, 2, 3, 4]] here")).toEqual(want);
  expect<unknown>(parseBoxes("<|ref|>title<|/ref|><|det|>[[100, 50, 600, 90]]<|/det|>\n# Cafe\n<|ref|>text<|/ref|><|det|>[[1, 2, 3, 4000]]<|/det|>\nDate [[1, 2, 3, 4]] here")).toEqual(want);
  expect(parseBoxes("no marks at all")).toEqual([]);
});

test("chunk packs paragraphs and cuts long ones", () => {
  expect(chunk("aa\n\nbb\n\ncc", 6)).toEqual(["aa\n\nbb", "cc"]);
  expect(chunk("x".repeat(25), 10).map((c) => c.length)).toEqual([10, 10, 5]);
});

test("folder -> OCR -> markdown -> search, and a second run skips finished files", async () => {
  const docs = join(tmp, "docs");
  await samplePdf(docs, "receipt.pdf", ["page one", "page two"]);
  await Bun.write(join(docs, "notes.txt"), "not a document we read");
  const db = openDb(cfg.dataDir);

  const added = await addPath(db, docs);
  expect(added.map((f) => f.name)).toEqual(["docs/receipt.pdf"]);
  const row = await processFile(db, cfg, added[0]!.id);
  expect(row).toMatchObject({ status: "done", page_count: 2, error: null });
  expect(ocrCalls).toBe(2);
  const md = await Bun.file(join(cfg.dataDir, "out", "docs", "receipt.pdf.md")).text();
  expect(md).toContain("# Corner Cafe");
  expect(md).toContain("Returns accepted");
  expect(md).not.toContain("<|det|>");
  const stored = db.query("SELECT image, boxes FROM pages WHERE file_id = ? ORDER BY page").all(row!.id) as any[];
  expect(stored.map((p) => p.image)).toEqual(["00001.png", "00002.png"]);
  expect(JSON.parse(stored[0].boxes)).toHaveLength(2);
  expect(await Bun.file(join(cfg.dataDir, "pages", String(row!.id), "00002.png")).exists()).toBe(true);

  expect((await addPath(db, docs))[0]!.done).toBe(true); // same content: nothing to do
  await processFile(db, cfg, added[0]!.id);
  expect(ocrCalls).toBe(2);

  expect(await indexPending(db, cfg.search)).toBe(1);
  expect(await indexPending(db, cfg.search)).toBe(0);
  const hits = await search(db, cfg.search, "croissant total");
  expect(hits[0]).toMatchObject({ name: "docs/receipt.pdf", page: 1 });
  expect((await search(db, cfg.search, "returns thirty days"))[0]!.page).toBe(2);

  // Read again: text and index are rebuilt.
  resetFiles(db, row!.id);
  expect(db.query("SELECT COUNT(*) AS n FROM pages").get()).toEqual({ n: 0 });
  expect((await processFile(db, cfg, row!.id))!.status).toBe("done");
  expect(ocrCalls).toBe(4);

  // Delete: rows, page images and markdown go; the source file imported from disk stays.
  await deleteFile(db, cfg, row!.id);
  expect(db.query("SELECT (SELECT COUNT(*) FROM files) + (SELECT COUNT(*) FROM pages) + (SELECT COUNT(*) FROM chunks) AS n").get()).toEqual({ n: 0 });
  expect(existsSync(join(cfg.dataDir, "pages", String(row!.id)))).toBe(false);
  expect(existsSync(join(cfg.dataDir, "out", "docs", "receipt.pdf.md"))).toBe(false);
  expect(existsSync(join(docs, "receipt.pdf"))).toBe(true);
  expect(await processFile(db, cfg, row!.id)).toBeNull(); // deleted while waiting: nothing to do
  db.close();
});

test("a file the converter cannot read is marked failed, not thrown", async () => {
  const db = openDb(join(tmp, "data-bad"));
  await Bun.write(join(tmp, "broken.pdf"), "this is not a pdf");
  const [f] = await addPath(db, join(tmp, "broken.pdf"));
  const row = await processFile(db, { ...cfg, dataDir: join(tmp, "data-bad") }, f!.id);
  expect(row!.status).toBe("failed");
  expect(row!.error).toBeTruthy();
  db.close();
});

test("folder names that could leave the data directory are refused", () => {
  expect(folderConfig(cfg, "Tax 2026").dataDir).toBe(join(cfg.dataDir, "folders", "Tax 2026"));
  for (const bad of ["", "..", "../x", "a/b", ".hidden", "x".repeat(51)]) expect(() => folderConfig(cfg, bad)).toThrow();
});

test("a folder with files still being read cannot be renamed or deleted", async () => {
  const busyCfg = { ...cfg, dataDir: join(tmp, "data-busy") };
  const db = openDb(folderConfig(busyCfg, "Inbox").dataDir);
  await Bun.write(join(tmp, "waiting.png"), "x");
  await addPath(db, join(tmp, "waiting.png"));
  db.close();
  expect(renameFolder(busyCfg, "Inbox", "Other")).rejects.toThrow("still has 1 file(s) being read");
  expect(removeFolder(busyCfg, "Inbox")).rejects.toThrow("still has 1 file(s) being read");
  expect(await listFolders(busyCfg)).toEqual(["Inbox"]);
});

test("server: upload, list, read, search; folders are separate; refuses other hosts and other sites", async () => {
  const dataDir = join(tmp, "data-server");
  const { server, idle } = await startServer({ ...cfg, dataDir });
  const root = (p: string) => `http://127.0.0.1:${server.port}${p}`;
  const url = (p: string) => root("/api/folders/default" + p.replace(/^\/api/, ""));
  await samplePdf(tmp, "upload.pdf", ["only page"]);
  expect(((await (await fetch(root("/api/folders"))).json()) as any).folders).toEqual([]); // a new install has no folder
  await fetch(root("/api/folders"), { method: "POST", body: JSON.stringify({ name: "default" }) });

  const form = new FormData();
  form.append("files", Bun.file(join(tmp, "upload.pdf")), "upload.pdf");
  form.append("files", new File(["x"], "virus.exe"));
  expect(await (await fetch(url("/api/files"), { method: "POST", body: form })).json()).toEqual({ added: 1, skipped: ["virus.exe"] });
  await idle();

  const list = (await (await fetch(url("/api/files"))).json()) as any;
  expect(list.files).toHaveLength(1);
  expect(list.files[0]).toMatchObject({ name: "upload.pdf", status: "done", page_count: 1, pages_done: 1 });
  const one = (await (await fetch(url(`/api/files/${list.files[0].id}`))).json()) as any;
  expect(one.pages).toHaveLength(1);
  expect(one.pages[0]).toMatchObject({ hasImage: true, boxes: [{ type: "title" }, { type: "table" }] });
  const img = await fetch(url(`/api/files/${list.files[0].id}/pages/1/image`));
  expect(img.headers.get("content-type")).toBe("image/png");
  expect((await fetch(url(`/api/files/${list.files[0].id}/pages/9/image`))).status).toBe(404);
  const found = (await (await fetch(url("/api/search?q=croissant"))).json()) as any;
  expect(found.results.length).toBeGreaterThan(0);

  expect((await fetch(url("/api/files/abc"))).status).toBe(400);
  expect((await fetch(url("/api/import"), { method: "POST", body: JSON.stringify({ path: "/no/such/dir" }) })).status).toBe(400);
  expect((await fetch(root("/"))).headers.get("content-type")).toContain("text/html");

  // A second folder starts empty, takes the same document again, and each search sees only its own.
  const post = (p: string, body: unknown) => fetch(root(p), { method: "POST", body: JSON.stringify(body) });
  expect((await post("/api/folders", { name: "../evil" })).status).toBe(400);
  expect((await fetch(root("/api/folders/nope/files"))).status).toBe(404);
  expect(await (await post("/api/folders", { name: " Receipts " })).json()).toEqual({ name: "Receipts" });
  expect((await post("/api/folders", { name: "Receipts" })).status).toBe(409);
  expect(((await (await fetch(root("/api/folders"))).json()) as any).folders).toEqual([
    { name: "default", files: 1, done: 1, failed: 0, active: 0 },
    { name: "Receipts", files: 0, done: 0, failed: 0, active: 0 },
  ]);
  expect(((await (await fetch(root("/api/folders/Receipts/files"))).json()) as any).files).toEqual([]);
  expect(((await (await fetch(root("/api/folders/Receipts/search?q=croissant"))).json()) as any).results).toEqual([]);
  const again = new FormData();
  again.append("files", Bun.file(join(tmp, "upload.pdf")), "upload.pdf");
  await fetch(root("/api/folders/Receipts/files"), { method: "POST", body: again });
  await idle();
  expect(((await (await fetch(root("/api/folders/Receipts/files"))).json()) as any).files).toHaveLength(1);
  expect(((await (await fetch(url("/api/files"))).json()) as any).files).toHaveLength(1);
  expect(await Bun.file(join(dataDir, "folders", "Receipts", "out", "upload.pdf.md")).exists()).toBe(true);

  // Rename: the files, their page images and their search move with the folder.
  const call = (method: string, p: string, body?: unknown) => fetch(root(p), { method, body: body ? JSON.stringify(body) : undefined });
  expect((await call("PATCH", "/api/folders/Receipts", { name: "default" })).status).toBe(409);
  expect((await call("PATCH", "/api/folders/Receipts", { name: "a/b" })).status).toBe(400);
  expect(await (await call("PATCH", "/api/folders/Receipts", { name: "Bills 2026" })).json()).toEqual({ name: "Bills 2026" });
  expect((await fetch(root("/api/folders/Receipts/files"))).status).toBe(404);
  const bills = ((await (await fetch(root("/api/folders/Bills%202026/files"))).json()) as any).files;
  expect(bills).toHaveLength(1);
  expect((await fetch(root(`/api/folders/Bills%202026/files/${bills[0].id}/pages/1/image`))).status).toBe(200);
  expect(((await (await fetch(root("/api/folders/Bills%202026/search?q=croissant"))).json()) as any).results.length).toBeGreaterThan(0);
  const moved = openDb(join(dataDir, "folders", "Bills 2026"));
  expect((moved.query("SELECT path, out_path FROM files").get() as any).out_path).toBe(join(dataDir, "folders", "Bills 2026", "out", "upload.pdf.md"));
  moved.close();

  // Read again, then delete the file: the uploaded copy goes too.
  expect((await call("POST", `/api/folders/Bills%202026/files/${bills[0].id}/redo`)).status).toBe(200);
  await idle();
  expect(((await (await fetch(root("/api/folders/Bills%202026/files"))).json()) as any).files[0].status).toBe("done");
  expect((await call("DELETE", `/api/folders/Bills%202026/files/${bills[0].id}`)).status).toBe(200);
  expect((await call("DELETE", `/api/folders/Bills%202026/files/${bills[0].id}`)).status).toBe(404);
  expect(((await (await fetch(root("/api/folders/Bills%202026/files"))).json()) as any).files).toEqual([]);
  expect(await Array.fromAsync(new Bun.Glob("{uploads,pages,out}/**/*").scan({ cwd: join(dataDir, "folders", "Bills 2026"), onlyFiles: true }))).toEqual([]);

  // Delete the folder: its directory is gone, the other folder is untouched.
  expect((await call("DELETE", "/api/folders/Bills%202026")).status).toBe(200);
  expect((await call("DELETE", "/api/folders/Bills%202026")).status).toBe(404);
  expect(existsSync(join(dataDir, "folders", "Bills 2026"))).toBe(false);
  expect(((await (await fetch(url("/api/files"))).json()) as any).files).toHaveLength(1);
  const st = (await (await fetch(root("/api/status"))).json()) as any;
  expect(st).toMatchObject({ waiting: 0, ocr: { state: "warn" } });

  expect(allowed(new Request("http://127.0.0.1:4477/api/files"))).toBe(true);
  expect(allowed(new Request("http://evil.example:4477/api/files"))).toBe(false);
  expect(allowed(new Request("http://127.0.0.1:4477/api/folder", { method: "POST", headers: { origin: "https://evil.example" } }))).toBe(false);
  expect(allowed(new Request("http://127.0.0.1:4477/api/folder", { method: "POST", headers: { origin: "http://127.0.0.1:4477" } }))).toBe(true);

  await server.stop(true);
});
