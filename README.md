# ollama-deepseek-ocr

Bulk OCR for PDFs, scans, photos and receipts with a local DeepSeek OCR model. Nothing leaves your machine.

- **OCR**: file -> page images -> model -> one markdown file per document + a SQLite database.
- **Page view**: each page image with a coloured box on every section the model read (headings, text, tables,
  images), beside the text. Text shows formatted or as markdown, and can be copied or downloaded.
- **Folders**: keep each kind of document (receipts, contracts, ...) apart. A folder has its own files, text,
  page images and search; nothing is shared between folders. Create, rename and delete them in the app.
- **Search** (separate feature, can be turned off): the OCR'd text is embedded and searched by meaning, per folder.
- Runs two ways on the same code: a **web app** and a **script** you point at a directory.

## Requirements

- [Bun](https://bun.sh) 1.2.3 or newer.
- [Ghostscript](https://ghostscript.com) (`brew install ghostscript`) to turn PDF pages into images. Keep it up to date.
- A local model server with an OpenAI-compatible API: Ollama, llama.cpp `llama-server` or LM Studio.
- macOS for HEIC/TIFF/GIF/BMP input (converted with the built-in `sips`). PDF, PNG, JPEG and WebP work anywhere.

## Use

Run these in the project directory.

```bash
bun install                               # once
bun run serve                             # web app on http://127.0.0.1:4477
bun run ocr ./scans ./one.pdf             # OCR directories (recursive) and files, then index them for search
bun run ocr -f Receipts ./scans           # same, into the folder "Receipts" (created if new)
bun run search -f Receipts "taxi"         # search only that folder
bun run redo -f Receipts                  # OCR every file of the folder again (after a change of model, prompt or pdfDpi)
bun run index                             # index OCR'd files for search (only those not indexed yet)
bun run folders                           # list the folders
bun run folders rename Receipts "Bills 2026"
bun run folders delete "Bills 2026" --yes # deletes the folder and everything the app keeps in it
bun run config                            # print the settings in use
```

`ocr`, `redo`, `index` and `search` work in the folder given with `-f` / `--folder`, or in `default`.

### In the web app

- **Folders** (left): `+` creates one; the pencil renames, the bin deletes. A folder cannot be renamed or deleted
  while one of its files is still being read.
- **Files** (middle): drop files on the list, use **Add files**, or add a whole directory from this machine. Each
  row can be read again or deleted. Search covers the open folder; `/` jumps to the search box.
- **Page** (right): the page image with the marked sections beside the text. The chips above it show or hide a
  kind of section.
- Lists update by themselves every 2 seconds while files are being read, and stop asking once all are finished.
  Files added from the terminal while the app is idle show up when you return to the tab or reload.
- The address remembers where you are (`#/Receipts/file/12`), so reload, back and shared links work.

### What delete removes

- **Delete file**: its text, page images, search entries and markdown. A file you uploaded is deleted with its
  uploaded copy; a file added from a directory on this machine is left where it is.
- **Delete folder**: the same for every file in it, and the folder's database.

Neither can be undone.

## Where things are kept

Per folder, under `data/folders/<folder>/`:

- `out/<directory>/<file>.md`: the text of each document, pages separated by `---`.
- `pages/<file id>/`: one image per page.
- `uploads/`: files added through the web app.
- `ocr.sqlite`: files, page text, section boxes and search index.

A file is identified by its content, per folder. Running again on the same directory skips what is finished,
retries what failed, and a stopped run continues from the page it reached.

## Settings

Defaults are in `src/config.ts`. To change any, create `config.json` in the project directory with only the keys you change:

```json
{
  "pdfDpi": 200,
  "ocr": { "baseUrl": "http://127.0.0.1:8080/v1", "model": "deepseek-ocr-2" },
  "search": { "enabled": false }
}
```

| Key | Default | Meaning |
|---|---|---|
| `port` | `4477` | Web app port |
| `dataDir` | `data` | Where the folders are kept |
| `pdfDpi` | `150` | PDF page image resolution. Raise for small print |
| `ocr.baseUrl` | `http://127.0.0.1:11434/v1` | OpenAI-compatible server that runs the OCR model |
| `ocr.model` | `hf.co/sabafallah/DeepSeek-OCR-2-GGUF:Q4_K_M` | Model name on that server |
| `ocr.prompt` | `Free OCR.` | Gives markdown with tables. `<\|grounding\|>Convert the document to markdown.` adds layout boxes but breaks tables on Ollama |
| `ocr.layoutPrompt` | `<\|grounding\|>Convert the document to markdown.` | Second read of each page that returns where each section is, for the boxes on the page image. `""` turns it off |
| `ocr.maxTokens` | `4096` | Longest answer for one page |
| `ocr.timeoutMs` | `600000` | Longest wait for one page |
| `search.enabled` | `true` | Index after OCR and allow search |
| `search.baseUrl` | `http://127.0.0.1:11434/v1` | Server that runs the embedding model |
| `search.model` | `nomic-embed-text` | Embedding model (`ollama pull nomic-embed-text`). Change it and `bun run index` re-indexes everything |
| `search.docPrefix`, `search.queryPrefix` | nomic prefixes | Set both to `""` for models that do not use them |
| `search.chunkChars` | `1000` | Size of the text pieces that are embedded |

## Running DeepSeek OCR 2

DeepSeek OCR 2 support was added to llama.cpp on 2026-05-29
([PR #20975](https://github.com/ggml-org/llama.cpp/pull/20975)). The model server must be new enough to include it.

- **Ollama**: `ollama pull hf.co/sabafallah/DeepSeek-OCR-2-GGUF:Q4_K_M`. Works on Ollama 0.40.17. Ollama 0.23.2 cannot load it
  (`unknown model architecture: 'deepseek2-ocr'`).
- **llama.cpp**: start `llama-server` with the flags from the
  [model card](https://huggingface.co/sabafallah/DeepSeek-OCR-2-GGUF) and set `ocr.baseUrl` to `http://127.0.0.1:8080/v1`.
- **DeepSeek OCR 1**: `ollama pull deepseek-ocr` and set `ocr.model` to `deepseek-ocr`.

Search needs an embedding model on a second server only if the OCR server cannot run one (`llama-server` runs one model).
The bottom of the folder list shows whether both model servers answer.

## How it is built

```
src/
  pipeline.ts     file -> page images (gs / sips) -> OCR model (text, then section boxes) -> SQLite + markdown;
                  delete a file, read a file again                                   (shared by CLI and server)
  folders.ts      where a folder lives; list, rename, delete
  search.ts       chunk + embed + search; reads what pipeline stored, pipeline never calls it
  server.ts       web API + one-at-a-time queue
  cli.ts          commands
  db.ts           SQLite schema (one database per folder)
  config.ts       defaults + config.json
  shared/         rules used by both the server and the web app (folder names)
  web/            the web app: React 19, Astryx design system, StyleX, TanStack Query
    api.ts          every HTTP call
    queries.ts      every read and change (cache, refresh, error toasts)
    route.ts        the address (#/folder/file/12), checked before use
    components/     Sidebar, FilePane, Viewer, PageView, dialogs, ...
test/ocr.test.ts  the whole flow against a stand-in model server
```

- No build step: Bun bundles `src/web/index.html` when the server starts serving it. `bun run dev` reloads as the code changes.
- The interface is built from [Astryx](https://astryx.atmeta.com) components (`@astryxdesign/core`) with its neutral theme, as shipped:
  light or dark follows the system setting. The few parts Astryx has no component for (the file rows, the page image with
  its section boxes) are styled with Astryx tokens, so they follow the theme too.
- Astryx is in beta and a theme works only with the Core release it names, so both are pinned to one exact version.
  Upgrade them together: `bun add -E @astryxdesign/core@latest @astryxdesign/theme-neutral@latest`.
- Our own StyleX is compiled by `stylex.plugin.ts` (wired in `bunfig.toml`), which is why commands are run in the project directory.
- `bun test` and `bun run typecheck` check the code.
- Search compares the query with every stored piece of text. That is fast to roughly 100k pieces per folder; past that,
  replace `search.ts` with sqlite-vec or LanceDB.

## Security and privacy

- The web app listens on `127.0.0.1` only, and its API refuses requests from other host names and other websites.
- Documents and text stay in `data/`; the only network calls go to the model servers you configure. Fonts and icons come with the installed packages and are served by the app, not fetched.
- Folder names are limited to letters, digits, spaces, `-` and `_`, so a name can never point outside `data/`.
- Delete only ever removes files inside the folder's own directory.
- Ghostscript runs with `-dSAFER`, so a PDF cannot read or write other files.
- OCR text is shown as text; HTML in it is never run and images it points to are never loaded.
