import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function openDb(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "ocr.sqlite"), { create: true });
  // WAL: the CLI and the server can use the same file at once.
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,          -- sha256 of the content: same file is never OCR'd twice
      path TEXT NOT NULL,
      name TEXT NOT NULL,                 -- shown in lists, and the markdown path under out/
      status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | done | failed
      page_count INTEGER,
      out_path TEXT,
      error TEXT,
      indexed_model TEXT,                 -- embedding model the chunks were made with
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      done_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pages (
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      page INTEGER NOT NULL,
      text TEXT NOT NULL,
      image TEXT,                         -- page image file name under pages/<file_id>/
      boxes TEXT,                         -- JSON [{type, box:[x1,y1,x2,y2] in 0..999, text}]
      PRIMARY KEY (file_id, page)
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      page INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB NOT NULL             -- unit-length Float32Array
    );
  `);
  // Databases made before page images existed.
  for (const col of ["image", "boxes"])
    if (!(db.query("PRAGMA table_info(pages)").all() as { name: string }[]).some((c) => c.name === col))
      db.exec(`ALTER TABLE pages ADD COLUMN ${col} TEXT`);
  return db;
}
