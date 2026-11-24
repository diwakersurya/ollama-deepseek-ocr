// Separate feature: turns stored OCR text into embeddings and searches them.
// Reads what pipeline.ts stored; pipeline.ts never calls this file.
import type { Database } from "bun:sqlite";
import type { Config } from "./config";

type SearchCfg = Config["search"];

/** Packs paragraphs into pieces of at most `max` characters; a longer paragraph is cut. */
export function chunk(text: string, max: number) {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    for (let i = 0; i < para.length; i += max) {
      const piece = para.slice(i, i + max);
      if (cur && cur.length + piece.length + 2 > max) {
        out.push(cur);
        cur = "";
      }
      cur = cur ? cur + "\n\n" + piece : piece;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function embed(cfg: SearchCfg, input: string[]) {
  const res = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.model, input }),
  });
  if (!res.ok) throw new Error(`embedding server ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map(({ embedding }) => {
    const v = Float32Array.from(embedding);
    const len = Math.hypot(...v) || 1;
    return v.map((x) => x / len); // unit length, so search is a plain dot product
  });
}

/** Embeds every OCR'd file not yet indexed with the current model (also re-indexes after a model change). */
export async function indexPending(db: Database, cfg: SearchCfg) {
  const files = db
    .query("SELECT id FROM files WHERE status = 'done' AND indexed_model IS NOT ?")
    .all(cfg.model) as { id: number }[];
  for (const { id } of files) {
    const pages = db.query("SELECT page, text FROM pages WHERE file_id = ? ORDER BY page").all(id) as {
      page: number;
      text: string;
    }[];
    const pieces = pages.flatMap((p) => chunk(p.text, cfg.chunkChars).map((text) => ({ page: p.page, text })));
    const vectors: Float32Array[] = [];
    for (let i = 0; i < pieces.length; i += 32)
      vectors.push(...(await embed(cfg, pieces.slice(i, i + 32).map((p) => cfg.docPrefix + p.text))));
    db.transaction(() => {
      db.run("DELETE FROM chunks WHERE file_id = ?", [id]);
      pieces.forEach((p, i) =>
        db.run("INSERT INTO chunks (file_id, page, text, embedding) VALUES (?, ?, ?, ?)", [
          id,
          p.page,
          p.text,
          new Uint8Array(vectors[i]!.buffer),
        ]),
      );
      db.run("UPDATE files SET indexed_model = ? WHERE id = ?", [cfg.model, id]);
    })();
  }
  return files.length;
}

export async function search(db: Database, cfg: SearchCfg, query: string, limit = 10) {
  const [q] = await embed(cfg, [cfg.queryPrefix + query]);
  // ponytail: compares against every chunk; fine to ~100k chunks. Past that, swap this file for sqlite-vec or LanceDB.
  const rows = db
    .query(
      "SELECT c.file_id, f.name, c.page, c.text, c.embedding FROM chunks c JOIN files f ON f.id = c.file_id WHERE f.indexed_model = ?",
    )
    .all(cfg.model) as { file_id: number; name: string; page: number; text: string; embedding: Uint8Array }[];
  // ponytail: embeddings alone rank exact words (names, invoice numbers) badly, so each query word
  // found in the text adds a little. Weight 0.2 is a knob; real keyword search = SQLite FTS5.
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
  return rows
    .map(({ embedding, ...row }) => {
      const v = new Float32Array(embedding.slice().buffer); // slice: a fresh, aligned copy
      let score = 0;
      for (let i = 0; i < v.length; i++) score += v[i]! * q![i]!;
      const text = row.text.toLowerCase();
      if (words.length) score += (0.2 * words.filter((w) => text.includes(w)).length) / words.length;
      return { ...row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
