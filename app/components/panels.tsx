import { Fragment } from "react";
import type { ProjectLoadFailure } from "@/lib/editor/project-store";
import { DISABLED_ICON, NoticeBar, PillButton } from "./ui";
import { SkinIcon } from "../skin/skin";
import type { InterfaceIconName } from "../skin/icons";
import { PinnedEnd } from "./pinned-end";
import { BarMenu } from "./bar-menu";

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
  /** Its compact form (G-118): each action a picture, under the same name, for a bar without room for the words. */
  compact?: boolean;
}

interface LineAction {
  label: string;
  title: string;
  icon: InterfaceIconName;
  onClick: () => void;
  disabled: boolean;
}

/** The actions in their groups, as both forms draw them; a group that `folds` is one menu in the compact form. */
function lineActions(p: BackstitchBarProps): ReadonlyArray<{ name: string; folds?: boolean; actions: readonly LineAction[] }> {
  const none = p.selectedCount === 0;
  return [
    {
      name: "Copy and paste",
      actions: [
        { label: "Copy", title: "Copy the selected line", icon: "copy", onClick: p.onCopy, disabled: none },
        { label: "Paste", title: "Paste the copied line", icon: "paste", onClick: p.onPaste, disabled: !p.hasClipboard },
        { label: "Duplicate", title: "Leave this line and take a copy of it", icon: "duplicate", onClick: p.onDuplicate, disabled: none },
      ],
    },
    {
      name: "Mirror and turn",
      folds: true,
      actions: [
        { label: "Mirror ↔", title: "Mirror left to right", icon: "flip-horizontal", onClick: p.onMirrorHorizontal, disabled: none },
        { label: "Mirror ↕", title: "Mirror top to bottom", icon: "flip-vertical", onClick: p.onMirrorVertical, disabled: none },
        { label: "Turn ↺", title: "Turn a quarter turn left", icon: "rotate-left", onClick: p.onRotateAnticlockwise, disabled: none },
        { label: "Turn ↻", title: "Turn a quarter turn right", icon: "rotate-right", onClick: p.onRotateClockwise, disabled: none },
      ],
    },
    {
      name: "Colour and delete",
      actions: [
        {
          label: "Recolour",
          title: p.canRecolour
            ? "Give the selected line the colour in hand"
            : "Pick a thread in the list first — there is no colour to use",
          icon: "fill-piece",
          onClick: p.onRecolour,
          disabled: none || !p.canRecolour,
        },
        { label: "Delete", title: "Delete the selected line (Delete)", icon: "delete", onClick: p.onDelete, disabled: none },
      ],
    },
  ];
}

function IconAction({ label, title, icon, onClick, disabled }: LineAction) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label}: ${title}`}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_ICON}`}
    >
      <SkinIcon name={icon} />
    </button>
  );
}

/**
 * What can be done to the backstitch in hand (G-073 M3).
 *
 * Drawn after the tool's options, as the selection's actions are. Unlike a floating selection, a backstitch edit is
 * committed as it happens, so history stays usable and Undo is never disabled by it. Both forms are this one component, so
 * the bar changing form keeps whatever has the focus.
 */
export function BackstitchBar(props: BackstitchBarProps) {
  const { selectedCount, onDeselect, compact = false } = props;
  const none = selectedCount === 0;
  return (
    <div className="flex items-center gap-2.5" data-testid="backstitch-bar" data-form={compact ? "compact" : "full"}>
      <span className="font-mono text-xs whitespace-nowrap text-muted" title={`${selectedCount} selected`}>
        {compact
          ? none
            ? "none"
            : `${selectedCount} ${selectedCount === 1 ? "line" : "lines"}`
          : none
            ? "none selected"
            : `${selectedCount} selected`}
      </span>
      {lineActions(props).map(({ name, folds, actions }, index) => (
        <Fragment key={name}>
          {index > 0 && <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />}
          <div className="flex items-center gap-1.5">
            {!compact ? (
              actions.map(({ label, title, onClick, disabled }) => (
                <PillButton key={label} size="xs" onClick={onClick} disabled={disabled} title={title}>
                  {label}
                </PillButton>
              ))
            ) : folds ? (
              <BarMenu
                label={name}
                trigger={
                  <span className="flex items-center gap-0.5">
                    <SkinIcon name={actions[0].icon} />
                    <SkinIcon name="chevron-down" />
                  </span>
                }
              >
                {() => (
                  <div className="flex items-center gap-1.5">
                    {actions.map((action) => (
                      <IconAction key={action.label} {...action} />
                    ))}
                  </div>
                )}
              </BarMenu>
            ) : (
              actions.map((action) => <IconAction key={action.label} {...action} />)
            )}
          </div>
        </Fragment>
      ))}
      <PinnedEnd>
        <PillButton size="xs" onClick={onDeselect} disabled={none} title="Escape">
          Deselect
        </PillButton>
      </PinnedEnd>
    </div>
  );
}
