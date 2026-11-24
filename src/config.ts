import { isAbsolute, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

export const defaults = {
  port: 4477,
  dataDir: "data", // where the folders are kept; relative = inside the project
  pdfDpi: 150, // raise for small print, lower for speed
  ocr: {
    // Any OpenAI-compatible server: Ollama (/v1), llama-server, LM Studio.
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "hf.co/sabafallah/DeepSeek-OCR-2-GGUF:Q4_K_M",
    // "Free OCR." gives clean markdown with tables. The "<|grounding|>Convert the document to markdown."
    // prompt adds layout boxes, but through Ollama its tables lose their rows and columns.
    prompt: "Free OCR.",
    // Second, cheap read of each page that returns where each section is, so the web app can mark
    // them on the page image. Set "" to skip it (no marks, a little faster).
    layoutPrompt: "<|grounding|>Convert the document to markdown.",
    maxTokens: 4096, // stops a page that makes the model repeat itself forever
    timeoutMs: 600_000,
  },
  search: {
    enabled: true,
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "nomic-embed-text",
    docPrefix: "search_document: ", // nomic-embed-text wants these; set "" for other models
    queryPrefix: "search_query: ",
    chunkChars: 1000,
  },
};

export type Config = typeof defaults;

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(join(root, "config.json"));
  const user = (await file.exists()) ? await file.json() : {};
  const cfg = {
    ...defaults,
    ...user,
    ocr: { ...defaults.ocr, ...user.ocr },
    search: { ...defaults.search, ...user.search },
  };
  if (!isAbsolute(cfg.dataDir)) cfg.dataDir = resolve(root, cfg.dataDir);
  return cfg;
}
