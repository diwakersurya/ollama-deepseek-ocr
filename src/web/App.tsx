import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import * as stylex from "@stylexjs/stylex";
import { FolderPlus, FolderX, MousePointerClick, Unplug } from "lucide-react";
import { useState } from "react";
import type { FolderInfo } from "./api";
import { FilePane } from "./components/FilePane";
import { type FolderDialog, FolderDialogs } from "./components/FolderDialogs";
import { Problems } from "./components/Problems";
import { SearchResults } from "./components/SearchResults";
import { Sidebar } from "./components/Sidebar";
import { ToastBridge } from "./components/ToastBridge";
import { Viewer } from "./components/Viewer";
import { useFiles, useFolders } from "./queries";
import { type Route, go, useRoute } from "./route";

const NARROW = "@media (max-width: 900px)";

const s = stylex.create({
  // Files on the left, the open file or the search results on the right.
  // On a narrow screen (a phone) there is room for one of the two: they take turns.
  work: { display: "grid", gridTemplateColumns: { default: "340px minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" }, height: "100%", minHeight: 0 },
  list: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  listAway: { display: { default: "flex", [NARROW]: "none" } },
  main: { minWidth: 0, minHeight: 0, overflow: "hidden" },
  mainAway: { display: { default: "block", [NARROW]: "none" } },
  centre: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 320 },
});

function Workspace({ folder, route, searchEnabled }: { folder: FolderInfo; route: Route; searchEnabled: boolean }) {
  const files = useFiles(folder.name).data?.files;
  const somethingOpen = route.fileId !== null || route.q !== null;
  return (
    <div {...stylex.props(s.work)}>
      <div {...stylex.props(s.list, somethingOpen && s.listAway)}>
        <FilePane folder={folder} files={files} openId={route.fileId} q={route.q} searchEnabled={searchEnabled} />
      </div>
      <div {...stylex.props(s.main, !somethingOpen && s.mainAway)}>
        {route.fileId ? (
          <Viewer key={route.fileId} folder={folder.name} id={route.fileId} page={route.page} info={files?.find((f) => f.id === route.fileId)} />
        ) : route.q ? (
          <SearchResults folder={folder.name} q={route.q} />
        ) : (
          <div {...stylex.props(s.centre)}>
            <EmptyState
              icon={<MousePointerClick size={32} />}
              title={files?.length === 0 ? "Add the first documents" : "Pick a file to see what was read"}
              description={
                files?.length === 0
                  ? "Drop PDFs, scans or photos on the list. Each page is read on this machine and nothing is sent anywhere."
                  : "You get each page with the sections that were read marked on it, beside the text."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const { data, isPending, isError } = useFolders();
  const [dialog, setDialog] = useState<FolderDialog>(null);
  const folders = data?.folders ?? [];
  // No folder in the address: show the first one.
  const current = route.folder ? folders.find((f) => f.name === route.folder) : folders[0];
  const newFolder = <Button label="New folder" icon={<FolderPlus size={15} />} variant="primary" onClick={() => setDialog({ kind: "new" })} />;
  return (
    <AppShell height="fill" contentPadding={0} banner={<Problems />} sideNav={<Sidebar folders={folders} current={current?.name ?? null} loaded={!isPending} serverDown={isError} onDialog={setDialog} />}>
      {current ? (
        <Workspace key={current.name} folder={current} route={route} searchEnabled={data?.searchEnabled ?? false} />
      ) : isPending ? null : (
        <div {...stylex.props(s.centre)}>
          {isError && !data ? (
            <EmptyState icon={<Unplug size={32} />} title="The app is not answering" description="Start it in the project directory with: bun run serve. This page reconnects by itself." />
          ) : route.folder ? (
            <EmptyState
              icon={<FolderX size={32} />}
              title={`There is no folder named “${route.folder}”`}
              description="It may have been renamed or deleted."
              actions={folders[0] ? <Button label={`Open ${folders[0].name}`} variant="secondary" onClick={() => go({ folder: folders[0]!.name })} /> : newFolder}
            />
          ) : (
            <EmptyState icon={<FolderPlus size={32} />} title="Create your first folder" description="A folder holds one kind of document, such as receipts or contracts. Each folder has its own files and its own search." actions={newFolder} />
          )}
        </div>
      )}
      <FolderDialogs dialog={dialog} folders={folders} current={current?.name ?? null} onClose={() => setDialog(null)} />
      <ToastBridge />
    </AppShell>
  );
}
