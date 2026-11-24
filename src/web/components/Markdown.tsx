import { Markdown as AstryxMarkdown } from "@astryxdesign/core/Markdown";

/** OCR text shown as a formatted document. An image the text points to is never loaded: its caption shows instead. */
export function Markdown({ text }: { text: string }) {
  return <AstryxMarkdown density="compact" headingLevelStart={3} components={{ image: ({ alt }) => <span>{alt}</span> }}>{text}</AstryxMarkdown>;
}
