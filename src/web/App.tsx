import * as stylex from "@stylexjs/stylex";
import { FolderPlus, FolderX, MousePointerClick, Unplug } from "lucide-react";
import { useState } from "react";
import type { FolderInfo } from "./api";
import { EmptyState } from "./components/EmptyState";
import { FilePane } from "./components/FilePane";
import { type FolderDialog, FolderDialogs } from "./components/FolderDialogs";
import { SearchResults } from "./components/SearchResults";
import { Sidebar } from "./components/Sidebar";
import { Toasts } from "./components/Toasts";
import { Viewer } from "./components/Viewer";
import { Button } from "./components/ui";
import { useFiles, useFolders } from "./queries";
import { type Route, go, useRoute } from "./route";
import { color } from "./tokens.stylex";

const NARROW = "@media (max-width: 900px)";

const s = stylex.create({
  shell: {
    display: "grid",
    gridTemplateColumns: { default: "240px 340px minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" },
    height: { default: "100%", [NARROW]: "auto" },
    minHeight: "100%",
    backgroundColor: color.surface,
  },
  main: { minWidth: 0, minHeight: 0, overflow: { default: "hidden", [NARROW]: "visible" } },
  wide: { gridColumn: { default: "2 / -1", [NARROW]: "auto" } },
});

/** One folder: its files on the left, and on the right the open file or the search results. */
function Workspace({ folder, route, searchEnabled }: { folder: FolderInfo; route: Route; searchEnabled: boolean }) {
  const files = useFiles(folder.name).data?.files;
  return (
    <>
      <FilePane folder={folder} files={files} openId={route.fileId} q={route.q} searchEnabled={searchEnabled} />
      <main {...stylex.props(s.main)}>
        {route.fileId ? (
          <Viewer key={route.fileId} folder={folder.name} id={route.fileId} page={route.page} info={files?.find((f) => f.id === route.fileId)} />
        ) : route.q ? (
          <SearchResults folder={folder.name} q={route.q} />
        ) : (
          <EmptyState icon={<MousePointerClick size={32} />} title={files?.length === 0 ? "Add the first documents" : "Pick a file to see what was read"}>
            {files?.length === 0
              ? "Drop PDFs, scans or photos on the list. Each page is read on this machine and nothing is sent anywhere."
              : "You get each page with the sections that were read marked on it, beside the text."}
          </EmptyState>
        )}
      </main>
    </>
  );
}

export function App() {
  const route = useRoute();
  const { data, isPending, isError } = useFolders();
  const [dialog, setDialog] = useState<FolderDialog>(null);
  const folders = data?.folders ?? [];
  // No folder in the address: show the first one.
  const current = route.folder ? folders.find((f) => f.name === route.folder) : folders[0];
  const newFolder = (
    <Button variant="primary" onClick={() => setDialog({ kind: "new" })}>
      <FolderPlus size={15} />
      New folder
    </Button>
  );
  return (
    <div {...stylex.props(s.shell)}>
      <Sidebar folders={folders} current={current?.name ?? null} loaded={!isPending} serverDown={isError} onDialog={setDialog} />
      {current ? (
        <Workspace key={current.name} folder={current} route={route} searchEnabled={data?.searchEnabled ?? false} />
      ) : (
        <main {...stylex.props(s.main, s.wide)}>
          {isPending ? null : isError && !data ? (
            <EmptyState icon={<Unplug size={32} />} title="The app is not answering">
              Start it in the project directory with: bun run serve. This page reconnects by itself.
            </EmptyState>
          ) : route.folder ? (
            <EmptyState icon={<FolderX size={32} />} title={`There is no folder named “${route.folder}”`} action={folders[0] ? <Button onClick={() => go({ folder: folders[0]!.name })}>Open {folders[0].name}</Button> : newFolder}>
              It may have been renamed or deleted.
            </EmptyState>
          ) : (
            <EmptyState icon={<FolderPlus size={32} />} title="Create your first folder" action={newFolder}>
              A folder holds one kind of document, such as receipts or contracts. Each folder has its own files and its own search.
            </EmptyState>
          )}
        </main>
      )}
      <FolderDialogs dialog={dialog} folders={folders} current={current?.name ?? null} onClose={() => setDialog(null)} />
      <Toasts />
    </div>
  );
}
