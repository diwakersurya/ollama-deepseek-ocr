import * as stylex from "@stylexjs/stylex";
import { SearchX } from "lucide-react";
import { useSearch } from "../queries";
import { format } from "../route";
import { color, radius, space } from "../tokens.stylex";
import { EmptyState } from "./EmptyState";

const pulse = stylex.keyframes({ "50%": { opacity: 0.5 } });

const s = stylex.create({
  wrap: { height: "100%", overflowY: "auto", paddingInline: space.x5, paddingBlockEnd: space.x6 },
  head: { display: "flex", alignItems: "center", minHeight: 56, fontSize: 16, fontWeight: 600 },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: space.x2, maxWidth: 820 },
  hit: { display: "flex", flexDirection: "column", gap: space.x1, padding: space.x4, backgroundColor: { default: color.raised, ":hover": color.raised2 }, borderRadius: radius.m, color: color.text, textDecoration: "none", transitionProperty: "background-color", transitionDuration: "120ms", outlineWidth: { default: 0, ":focus-visible": 2 }, outlineStyle: "solid", outlineColor: color.accent },
  where: { display: "flex", gap: space.x2, alignItems: "baseline", fontWeight: 500 },
  page: { fontSize: 12, fontWeight: 400, color: color.faint, flexShrink: 0 },
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  text: { color: color.muted, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" },
  skeleton: { height: 96, borderRadius: radius.m, backgroundColor: color.raised, animationName: pulse, animationDuration: "1.4s", animationIterationCount: "infinite", "@media (prefers-reduced-motion: reduce)": { animationDuration: "0s" } },
  error: { color: color.bad },
});

export function SearchResults({ folder, q }: { folder: string; q: string }) {
  const { data, isPending, error } = useSearch(folder, q);
  if (data && !data.results.length)
    return (
      <EmptyState icon={<SearchX size={32} />} title={`Nothing in ${folder} matches “${q}”`}>
        Search looks only inside this folder, and only at files that have finished reading.
      </EmptyState>
    );
  return (
    <div {...stylex.props(s.wrap)}>
      <h2 {...stylex.props(s.head)}>
        Results for “{q}” in {folder}
      </h2>
      {error && <p {...stylex.props(s.error)}>Search did not work: {error.message}</p>}
      <ul {...stylex.props(s.list)}>
        {isPending && [0, 1, 2].map((i) => <li key={i} {...stylex.props(s.skeleton)} />)}
        {data?.results.map((r, i) => (
          <li key={i}>
            <a href={format({ folder, fileId: r.file_id, page: r.page })} {...stylex.props(s.hit)}>
              <span {...stylex.props(s.where)}>
                <span {...stylex.props(s.name)}>{r.name}</span>
                <span {...stylex.props(s.page)}>page {r.page}</span>
              </span>
              <span {...stylex.props(s.text)}>{r.text.replace(/[#*|>-]{2,}|[|*#]/g, " ").replace(/\s+/g, " ")}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
