import type { ProjectLoadFailure } from "@/lib/editor/project-store";
import { NoticeBar, PillButton } from "./ui";

export interface WorkspaceNoticesProps {
  restoreFailure: ProjectLoadFailure | null;
  onDownloadRestoreReport: () => void;
  onDismissRestoreFailure: () => void;
  openError: string | null;
  onDismissOpenError: () => void;
  /** What an OXS import changed or left out (G-028). */
  openNotice: string | null;
  onDismissOpenNotice: () => void;
  exportError: string | null;
  onDismissExportError: () => void;
}

/** The strips under the bar of tool options: a failed auto-restore (D101), and open and export errors. */
export function WorkspaceNotices({
  restoreFailure,
  onDownloadRestoreReport,
  onDismissRestoreFailure,
  openError,
  onDismissOpenError,
  openNotice,
  onDismissOpenNotice,
  exportError,
  onDismissExportError,
}: WorkspaceNoticesProps) {
  return (
    <>
      {restoreFailure && (
        <div
          role="alert"
          data-testid="restore-failure"
          className="flex flex-wrap items-center gap-3 border-b border-warning-strong bg-warning-deep/60 px-4 py-1 text-xs text-warning"
        >
          <span>
            The autosaved project couldn&apos;t be restored, so this session started fresh. The failed data is available as an error report.
          </span>
          <button
            type="button"
            onClick={onDownloadRestoreReport}
            className="rounded-full border border-warning-edge px-3 py-0.5 font-medium hover:bg-warning-strong"
          >
            Download error report
          </button>
          <button type="button" onClick={onDismissRestoreFailure} className="rounded-full px-3 py-0.5 font-medium hover:bg-warning-strong">
            Dismiss
          </button>
        </div>
      )}
      {openError && (
        <NoticeBar key={openError} tone="error" onDismiss={onDismissOpenError}>
          {openError}
        </NoticeBar>
      )}
      {openNotice && (
        <NoticeBar tone="info" onDismiss={onDismissOpenNotice}>
          <span data-testid="open-notice">{openNotice}</span>
        </NoticeBar>
      )}
      {exportError && (
        <NoticeBar key={exportError} tone="error" onDismiss={onDismissExportError}>
          {exportError}
        </NoticeBar>
      )}
    </>
  );
}

/** The end of a tool's own controls that stays in view while the rest scrolls under it in a narrow window (as D213): the pair that commits. */
export const PINNED_END = "sticky right-0 z-10 flex shrink-0 items-center gap-1.5 bg-surface pl-2";

export interface BackstitchBarProps {
  /** How many lines are in hand; every action but Paste needs at least one. */
  selectedCount: number;
  hasClipboard: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onMirrorHorizontal: () => void;
  onMirrorVertical: () => void;
  onRotateClockwise: () => void;
  onRotateAnticlockwise: () => void;
  onRecolour: () => void;
  /** False when no thread is in hand, which leaves nothing to recolour to. */
  canRecolour: boolean;
  onDelete: () => void;
  onDeselect: () => void;
}

/**
 * What can be done to the backstitch in hand (G-073 M3).
 *
 * Drawn after the tool's options, as the selection's actions are. Unlike a floating selection, a backstitch edit is
 * committed as it happens, so history stays usable and Undo is never disabled by it.
 */
export function BackstitchBar({
  selectedCount,
  hasClipboard,
  onCopy,
  onPaste,
  onDuplicate,
  onMirrorHorizontal,
  onMirrorVertical,
  onRotateClockwise,
  onRotateAnticlockwise,
  onRecolour,
  canRecolour,
  onDelete,
  onDeselect,
}: BackstitchBarProps) {
  const none = selectedCount === 0;
  return (
    <div className="flex min-w-max flex-1 items-center gap-2.5" data-testid="backstitch-bar">
      <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Backstitch</span>
      <span className="font-mono text-xs whitespace-nowrap text-muted">{none ? "none selected" : `${selectedCount} selected`}</span>
      <div className="flex items-center gap-1.5">
        <PillButton size="xs" onClick={onCopy} disabled={none} title="Copy the selected line">
          Copy
        </PillButton>
        <PillButton size="xs" onClick={onPaste} disabled={!hasClipboard} title="Paste the copied line">
          Paste
        </PillButton>
        <PillButton size="xs" onClick={onDuplicate} disabled={none} title="Leave this line and take a copy of it">
          Duplicate
        </PillButton>
      </div>
      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <div className="flex items-center gap-1.5">
        <PillButton size="xs" onClick={onMirrorHorizontal} disabled={none} title="Mirror left to right">
          Mirror ↔
        </PillButton>
        <PillButton size="xs" onClick={onMirrorVertical} disabled={none} title="Mirror top to bottom">
          Mirror ↕
        </PillButton>
        <PillButton size="xs" onClick={onRotateAnticlockwise} disabled={none} title="Turn a quarter turn left">
          Turn ↺
        </PillButton>
        <PillButton size="xs" onClick={onRotateClockwise} disabled={none} title="Turn a quarter turn right">
          Turn ↻
        </PillButton>
      </div>
      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <PillButton
        size="xs"
        onClick={onRecolour}
        disabled={none || !canRecolour}
        title={canRecolour ? "Give the selected line the colour in hand" : "Pick a thread in the list first — there is no colour to use"}
      >
        Recolour
      </PillButton>
      <PillButton size="xs" onClick={onDelete} disabled={none} title="Delete the selected line (Delete)">
        Delete
      </PillButton>
      <div className={`ml-auto ${PINNED_END}`}>
        <PillButton size="xs" onClick={onDeselect} disabled={none} title="Escape">
          Deselect
        </PillButton>
      </div>
    </div>
  );
}
