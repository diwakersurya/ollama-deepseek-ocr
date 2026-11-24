import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { colorVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { SearchX } from "lucide-react";
import { useSearch } from "../queries";
import { format } from "../route";

const s = stylex.create({
  wrap: { height: "100%", overflowY: "auto", paddingInline: spacingVars["--spacing-6"], paddingBlock: spacingVars["--spacing-4"], display: "flex", flexDirection: "column", gap: spacingVars["--spacing-4"] },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: spacingVars["--spacing-2"], maxWidth: 820 },
  hit: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-1"],
    padding: spacingVars["--spacing-4"],
    backgroundColor: { default: colorVars["--color-background-surface"], ":hover": { "@media (hover: hover)": colorVars["--color-background-muted"] } },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-container"],
    color: "inherit",
    textDecoration: "none",
  },
  name: { minWidth: 0 },
});

export function SearchResults({ folder, q }: { folder: string; q: string }) {
  const { data, isPending, error } = useSearch(folder, q);
  if (data && !data.results.length)
    return <EmptyState icon={<SearchX size={32} />} title={`Nothing in ${folder} matches “${q}”`} description="Search looks only inside this folder, and only at files that have finished reading." />;
  return (
    <div {...stylex.props(s.wrap)}>
      <Heading level={2}>
        Results for “{q}” in {folder}
      </Heading>
      {error && <Text color="accent">Search did not work: {error.message}</Text>}
      <ul {...stylex.props(s.list)}>
        {isPending &&
          [0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton height={96} index={i} />
            </li>
          ))}
        {data?.results.map((r, i) => (
          <li key={i}>
            <a href={format({ folder, fileId: r.file_id, page: r.page })} {...stylex.props(s.hit)}>
              <HStack gap={2} align="center">
                <Text weight="medium" maxLines={1} xstyle={s.name}>
                  {r.name}
                </Text>
                <Text size="sm" color="secondary">
                  page {r.page}
                </Text>
              </HStack>
              <Text color="secondary" maxLines={3}>
                {r.text.replace(/[#*|>-]{2,}|[|*#]/g, " ").replace(/\s+/g, " ")}
              </Text>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
