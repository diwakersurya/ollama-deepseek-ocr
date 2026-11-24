import { CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import type { FileInfo } from "../api";
import { Spin } from "./ui";

/** What a file's state means, in words (shown on hover and read by screen readers). */
export function statusText(f: Pick<FileInfo, "status" | "error" | "page_count" | "pages_done">) {
  if (f.status === "failed") return "Could not be read: " + f.error;
  if (f.status === "processing") return f.page_count ? `Reading page ${Math.min(f.pages_done + 1, f.page_count)} of ${f.page_count}` : "Getting the pages ready";
  return f.status === "done" ? "Read" : "Waiting its turn";
}

export function StatusIcon({ file }: { file: Pick<FileInfo, "status" | "error" | "page_count" | "pages_done"> }) {
  const label = statusText(file);
  const icon =
    file.status === "done" ? (
      <CircleCheck size={16} color="#a5d6a7" />
    ) : file.status === "failed" ? (
      <CircleAlert size={16} color="#ef9a9a" />
    ) : file.status === "processing" ? (
      <Spin>
        <LoaderCircle size={16} color="#ffcc80" />
      </Spin>
    ) : (
      <Clock size={16} color="#757575" />
    );
  return (
    <span role="img" aria-label={label} title={label} style={{ display: "inline-flex", flexShrink: 0 }}>
      {icon}
    </span>
  );
}
