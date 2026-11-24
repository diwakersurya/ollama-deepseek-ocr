import { z } from "zod";

/** One rule for folder names, used by the server (the name becomes a directory) and by the forms. */
export const folderName = z
  .string()
  .trim()
  .regex(/^\w[\w -]{0,49}$/, "Use letters, digits, spaces, - and _ (50 at most)");
