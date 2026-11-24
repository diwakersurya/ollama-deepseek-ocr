import { IconButton } from "@astryxdesign/core/IconButton";
import * as stylex from "@stylexjs/stylex";
import { ArrowLeft } from "lucide-react";
import { go } from "../route";

const s = stylex.create({
  // Only on a narrow screen, where the file list and the open file take turns.
  narrowOnly: { display: { default: "none", "@media (max-width: 900px)": "inline-flex" } },
});

export function BackToFiles({ folder }: { folder: string }) {
  return (
    <span {...stylex.props(s.narrowOnly)}>
      <IconButton label="Back to the files" tooltip="Back to the files" icon={<ArrowLeft size={18} />} variant="ghost" onClick={() => go({ folder })} />
    </span>
  );
}
