import * as stylex from "@stylexjs/stylex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { color, font, radius, space } from "../tokens.stylex";

const s = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.x3, lineHeight: 1.6, overflowWrap: "anywhere" },
  h: { margin: 0, fontSize: 16, fontWeight: 600, color: color.text },
  h1: { fontSize: 18 },
  scroll: { overflowX: "auto" },
  table: { borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  cell: { paddingBlock: space.x1, paddingInline: space.x3, borderWidth: 1, borderStyle: "solid", borderColor: color.line, textAlign: "start", verticalAlign: "top" },
  th: { backgroundColor: color.raised3, fontWeight: 600 },
  code: { fontFamily: font.mono, fontSize: 13, backgroundColor: color.raised3, borderRadius: radius.s, paddingInline: space.x1 },
  hr: { width: "100%", borderWidth: 0, borderBlockStartWidth: 1, borderStyle: "solid", borderColor: color.line, margin: 0 },
  list: { margin: 0, paddingInlineStart: space.x5 },
  link: { color: color.accent },
});

/** OCR text shown as a formatted document. Raw HTML in the text is never run: it shows as text. */
export function Markdown({ text }: { text: string }) {
  return (
    <div {...stylex.props(s.root)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h4 {...stylex.props(s.h, s.h1)}>{children}</h4>,
          h2: ({ children }) => <h4 {...stylex.props(s.h)}>{children}</h4>,
          h3: ({ children }) => <h4 {...stylex.props(s.h)}>{children}</h4>,
          table: ({ children }) => (
            <div {...stylex.props(s.scroll)}>
              <table {...stylex.props(s.table)}>{children}</table>
            </div>
          ),
          th: ({ children }) => <th {...stylex.props(s.cell, s.th)}>{children}</th>,
          td: ({ children }) => <td {...stylex.props(s.cell)}>{children}</td>,
          code: ({ children }) => <code {...stylex.props(s.code)}>{children}</code>,
          hr: () => <hr {...stylex.props(s.hr)} />,
          ul: ({ children }) => <ul {...stylex.props(s.list)}>{children}</ul>,
          ol: ({ children }) => <ol {...stylex.props(s.list)}>{children}</ol>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" {...stylex.props(s.link)}>
              {children}
            </a>
          ),
          img: ({ alt }) => <span>{alt}</span>, // never load an image the document points to
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
