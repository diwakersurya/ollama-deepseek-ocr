// Tells a setup problem (Ollama not running, model not downloaded, ...) from a problem with one
// document, and says in plain words what to do about it.
import { existsSync } from "node:fs";
import type { Config } from "./config";

export type Problem = {
  id: "ocr" | "search" | "pdf" | "index";
  level: "error" | "warning";
  title: string;
  detail: string;
  /** A command that fixes it, when there is one. */
  fix?: string;
};

/** The setup is wrong, not the document: the file keeps waiting and is read once this is fixed. */
export class SetupError extends Error {
  constructor(public problem: Problem) {
    super(`${problem.title}. ${problem.detail}${problem.fix ? ` Fix: ${problem.fix}` : ""}`);
  }
}

type Role = "ocr" | "search";
const LABEL = { ocr: "OCR model", search: "search model" } as const;
const SETTING = { ocr: "ocr.baseUrl", search: "search.baseUrl" } as const;

// ponytail: Ollama is recognised by its usual port; another server on that port gets Ollama's wording.
const isOllama = (baseUrl: string) => /:11434(\/|$)/.test(baseUrl);
const ollamaInstalled = () => !!Bun.which("ollama") || existsSync("/Applications/Ollama.app");

export function notReachable(role: Role, baseUrl: string, installed = ollamaInstalled()): Problem {
  if (!isOllama(baseUrl))
    return { id: role, level: "error", title: `The ${LABEL[role]} server is not answering`, detail: `Nothing answers at ${baseUrl}. Start that server, or change ${SETTING[role]} in config.json.` };
  return installed
    ? { id: role, level: "error", title: "Ollama is not running", detail: "Open the Ollama app, or start it from a terminal.", fix: "ollama serve" }
    : { id: role, level: "error", title: "Ollama is not installed", detail: "Get it from https://ollama.com/download, or install it with Homebrew.", fix: "brew install ollama && brew services start ollama" };
}

export function notDownloaded(role: Role, baseUrl: string, model: string): Problem {
  return isOllama(baseUrl)
    ? { id: role, level: "error", title: `The ${LABEL[role]} is not downloaded`, detail: `Ollama does not have ${model} yet.`, fix: `ollama pull ${model}` }
    : { id: role, level: "warning", title: `The ${LABEL[role]} may be missing`, detail: `${baseUrl} does not list ${model}. If reading fails, check the model name in config.json.` };
}

/** The message inside an error answer: {"error":{"message":"..."}}, {"error":"..."} or plain text. */
export function messageOf(body: string) {
  try {
    const error = JSON.parse(body).error;
    return String(typeof error === "string" ? error : (error?.message ?? body));
  } catch {
    return body;
  }
}

/** An error answer from the model server that means the setup is wrong; null when it is about the request. */
export function fromAnswer(role: Role, baseUrl: string, model: string, status: number, body: string): Problem | null {
  const message = messageOf(body);
  if (status === 404 && /not found/i.test(message)) return { ...notDownloaded(role, baseUrl, model), level: "error" };
  if (/unable to load model/i.test(message))
    return { id: role, level: "error", title: `${isOllama(baseUrl) ? "Ollama" : "The server"} could not load the ${LABEL[role]}`, detail: "This usually means the server is too old for the model. DeepSeek OCR 2 needs Ollama 0.40 or newer: update Ollama." };
  if (/more system memory|out of memory/i.test(message))
    return { id: role, level: "error", title: `Not enough free memory to load the ${LABEL[role]}`, detail: "Close other large apps, or stop other models with: ollama stop <model>." };
  return null;
}

/** A request that never got an answer. A page that just took too long is not a setup problem: null. */
export function fromThrown(role: Role, baseUrl: string, error: unknown): Problem | null {
  return (error as { name?: string })?.name === "TimeoutError" ? null : notReachable(role, baseUrl);
}

/** For errors that are about one request: what the server said, shortened. */
export const answered = (role: Role, status: number, body: string) => `The ${LABEL[role]} server answered ${status}: ${messageOf(body).slice(0, 300)}`;

async function checkServer(role: Role, baseUrl: string, model: string): Promise<Problem | null> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(3000) });
  } catch {
    return notReachable(role, baseUrl);
  }
  if (!res.ok) return { id: role, level: "error", title: `The ${LABEL[role]} server is not working`, detail: `${baseUrl} answered ${res.status}.` };
  const ids = (((await res.json().catch(() => ({}))) as { data?: { id: string }[] }).data ?? []).map((m) => m.id);
  return ids.some((id) => id === model || id === model + ":latest") ? null : notDownloaded(role, baseUrl, model);
}

/** Everything that would stop the app from doing its job right now. Empty when all is well. */
export async function diagnose(cfg: Config): Promise<Problem[]> {
  const [ocr, search] = await Promise.all([
    checkServer("ocr", cfg.ocr.baseUrl, cfg.ocr.model),
    cfg.search.enabled ? checkServer("search", cfg.search.baseUrl, cfg.search.model) : null,
  ]);
  const pdf: Problem | null = Bun.which("gs") ? null : { id: "pdf", level: "warning", title: "Ghostscript is not installed", detail: "PDFs cannot be read until it is. Images still work.", fix: "brew install ghostscript" };
  return [ocr, search, pdf].filter((p): p is Problem => p !== null);
}
