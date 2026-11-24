// The kinds of section the model marks on a page. `ink` is drawn on the (white) page image,
// `chip` is the same hue at a 200 tone for the dark interface.
export const SECTION = {
  title: { label: "Headings", ink: "#ef6c00", chip: "#ffcc80" },
  text: { label: "Text", ink: "#00897b", chip: "#80cbc4" },
  table: { label: "Tables", ink: "#8e24aa", chip: "#ce93d8" },
  image: { label: "Images", ink: "#1e88e5", chip: "#90caf9" },
  other: { label: "Other", ink: "#757575", chip: "#bdbdbd" },
} as const;

export type SectionKind = keyof typeof SECTION;

export function kindOf(type: string): SectionKind {
  if (/title/i.test(type)) return "title";
  if (/table/i.test(type)) return "table";
  if (/image|figure|picture/i.test(type)) return "image";
  if (/text|caption|list|paragraph|footnote/i.test(type)) return "text";
  return "other";
}
