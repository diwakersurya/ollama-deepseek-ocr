import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Folder, FolderOpen, FolderPlus, Pencil, ScanText, Trash2 } from "lucide-react";
import type { FolderInfo, Problem } from "../api";
import { useStatus } from "../queries";
import { format } from "../route";
import type { FolderDialog } from "./FolderDialogs";

function FolderItem({ folder, active, onDialog }: { folder: FolderInfo; active: boolean; onDialog: (d: FolderDialog) => void }) {
  // A folder cannot be renamed or deleted while one of its files is still being read.
  const busy = folder.active > 0 ? `${folder.active} file${folder.active === 1 ? " is" : "s are"} still being read` : null;
  return (
    <SideNavItem
      label={folder.name}
      href={format({ folder: folder.name })}
      isSelected={active}
      icon={Folder}
      selectedIcon={FolderOpen}
      endContent={
        <Text size="sm" color="secondary" hasTabularNumbers>
          {folder.failed ? `${folder.files}, ${folder.failed} failed` : folder.files}
        </Text>
      }
      actions={
        <>
          <IconButton label={`Rename ${folder.name}`} tooltip={busy ?? "Rename"} icon={<Pencil size={14} />} variant="ghost" size="sm" isDisabled={!!busy} onClick={() => onDialog({ kind: "rename", folder })} />
          <IconButton label={`Delete ${folder.name}`} tooltip={busy ?? "Delete"} icon={<Trash2 size={14} />} variant="ghost" size="sm" isDisabled={!!busy} onClick={() => onDialog({ kind: "delete", folder })} />
        </>
      }
    />
  );
}

/** One line of the status area: ready, or the problem in its own words (details are in the banner and the tooltip). */
function ModelLine({ ready, problem }: { ready: string; problem: Problem | undefined }) {
  const text = problem?.title ?? ready;
  return (
    <HStack gap={2} align="center">
      <StatusDot variant={!problem ? "success" : problem.level === "error" ? "error" : "warning"} label={text} tooltip={problem?.detail} />
      <Text size="sm" color="secondary">
        {text}
      </Text>
    </HStack>
  );
}

/** What the machine is doing: the queue and the two model servers. */
function SystemStatus({ serverDown }: { serverDown: boolean }) {
  const { data } = useStatus();
  if (serverDown)
    return (
      <HStack gap={2} align="center" padding={3}>
        <StatusDot variant="error" label="The app is not answering" />
        <Text size="sm" color="secondary">
          The app is not answering. Start it with: bun run serve
        </Text>
      </HStack>
    );
  if (!data) return null;
  const files = `${data.waiting} file${data.waiting === 1 ? "" : "s"}`;
  const queue = !data.waiting ? "Nothing waiting" : data.paused ? `Paused, ${files} waiting` : `Reading, ${files} to go`;
  const problem = (...ids: Problem["id"][]) => data.problems.find((p) => ids.includes(p.id));
  return (
    <VStack gap={2} padding={3}>
      <HStack gap={2} align="center">
        <StatusDot variant={!data.waiting ? "neutral" : data.paused ? "warning" : "accent"} label={queue} isPulsing={data.waiting > 0 && !data.paused} />
        <Text size="sm" color="secondary">
          {queue}
        </Text>
      </HStack>
      <ModelLine ready="OCR model ready" problem={problem("ocr", "pdf")} />
      {data.search ? (
        <ModelLine ready="Search model ready" problem={problem("search", "index")} />
      ) : (
        <HStack gap={2} align="center">
          <StatusDot variant="neutral" label="Search is off" tooltip="Turned off in config.json" />
          <Text size="sm" color="secondary">
            Search is off
          </Text>
        </HStack>
      )}
    </VStack>
  );
}

type Props = { folders: FolderInfo[]; current: string | null; loaded: boolean; serverDown: boolean; onDialog: (d: FolderDialog) => void };

export function Sidebar({ folders, current, loaded, serverDown, onDialog }: Props) {
  return (
    <SideNav aria-label="Folders" header={<SideNavHeading heading="Bulk OCR" icon={<ScanText size={20} />} />} footer={<SystemStatus serverDown={serverDown} />}>
      <SideNavSection title="Folders" endContent={<IconButton label="New folder" tooltip="New folder" icon={<FolderPlus size={16} />} variant="ghost" size="sm" onClick={() => onDialog({ kind: "new" })} />}>
        {folders.map((f) => (
          <FolderItem key={f.name} folder={f} active={f.name === current} onDialog={onDialog} />
        ))}
        {loaded && !folders.length && (
          <Text size="sm" color="secondary">
            No folders yet
          </Text>
        )}
      </SideNavSection>
    </SideNav>
  );
}
