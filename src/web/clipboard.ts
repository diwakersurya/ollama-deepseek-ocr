import { toast } from "./toast";

/** Copies text and says so. Browsers allow copying only on https or on the computer itself, so it can fail. */
export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.ok(done);
  } catch {
    toast.bad("Could not copy. The browser allows it only on an https address or on the computer itself. Select the text instead.");
  }
}
