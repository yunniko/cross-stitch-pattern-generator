"use client";

/**
 * Every workspace switched off (G-103, Owner 2026-10-06): not a normal state, an emergency one. The editor is not drawn
 * empty; a window says what happened instead. The chart the browser keeps is untouched, and is there again once a
 * workspace is switched back on.
 */
export function NoWorkspace() {
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div
        role="alertdialog"
        aria-labelledby="no-workspace-title"
        aria-describedby="no-workspace-text"
        className="flex w-[460px] max-w-full flex-col gap-3 rounded-xl border border-danger-edge bg-surface p-[22px]"
      >
        <h2 id="no-workspace-title" className="m-0 text-lg font-medium text-danger">
          The editor is not available right now
        </h2>
        <p id="no-workspace-text" className="m-0 text-[13px] leading-[19px] text-muted">
          Photo, Edit and Export are all switched off for you, so there is nothing to open. Your chart is kept in this browser as it was and
          comes back when they are switched on again. Try again later, or contact the site&apos;s administrator.
        </p>
      </div>
    </div>
  );
}
