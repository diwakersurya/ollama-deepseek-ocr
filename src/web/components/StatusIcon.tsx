import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import type { FileInfo } from "../api";

type Progress = Pick<FileInfo, "status" | "error" | "page_count" | "pages_done">;

/** What a file's state means, in words (shown on hover and read by screen readers). */
export function statusText(f: Progress) {
  if (f.status === "failed") return "Could not be read: " + f.error;
  if (f.status === "processing") return f.page_count ? `Reading page ${Math.min(f.pages_done + 1, f.page_count)} of ${f.page_count}` : "Getting the pages ready";
  return f.status === "done" ? "Read" : "Waiting its turn";
}

export function StatusIcon({ file }: { file: Progress }) {
  const label = statusText(file);
  return (
    <Tooltip content={label}>
      <span role="img" aria-label={label} style={{ display: "inline-flex", flexShrink: 0 }}>
        {file.status === "done" ? (
          <Icon icon={CircleCheck} size="sm" color="success" />
        ) : file.status === "failed" ? (
          <Icon icon={CircleAlert} size="sm" color="error" />
        ) : file.status === "processing" ? (
          <Spinner size="sm" />
        ) : (
          <Icon icon={Clock} size="sm" color="secondary" />
        )}
      </span>
    </Tooltip>
  );
}
