"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { formatSavedAt, type SavedChartLink } from "@/lib/charts/saved-chart-link";
import { SAVE_TO_ACCOUNT_FEATURE } from "@/lib/charts/saved-charts";
import { SkinIcon } from "../skin/skin";
import type { GatedAction } from "./feature-gate";
import { DISABLED_ICON } from "./ui";

/**
 * Save, as a menu in two groups (G-108 part 1, Owner 2026-10-06): the account (Save, and Save as copy once the chart is
 * saved there) and the file (the editable download Save was before). Signed out, the account group is greyed with a note
 * and a way to sign in; the file is always there unless Export is switched off.
 */

export interface SaveMenuProps {
  /** Something is being saved or exported: every item waits. */
  busy: boolean;
  /** The account group; null when saving to an account is hidden (G-102). */
  account: null | {
    signedIn: boolean;
    /** The note when the feature is locked: the group is greyed with it. */
    locked?: string;
    /** The saved chart the open one is, or none yet. */
    saved: SavedChartLink | null;
    save: () => void;
    saveCopy: () => void;
  };
  /** The editable download, under Export's switch (G-103): null when hidden, `locked` its note. */
  toFile: GatedAction;
  /** The bar's button style, so the trigger looks like its neighbours. */
  buttonClassName: string;
  /** The bar's word style: the word is given up on a narrow bar. */
  wordClassName: string;
}

const MARGIN = 8;
const ITEM = `flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink enabled:hover:bg-raised focus-visible:bg-raised focus-visible:outline-none ${DISABLED_ICON}`;

export function SaveMenu({ busy, account, toFile, buttonClassName, wordClassName }: SaveMenuProps) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];

  const close = (giveBack: boolean) => {
    setOpen(false);
    setAt(null);
    if (giveBack) button.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const b = button.current.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(b.left, window.innerWidth - panel.current.offsetWidth - MARGIN));
    setAt({ left, top: b.bottom + 4 });
  }, [open]);

  useEffect(() => {
    if (open && at) items()[0]?.focus();
  }, [open, at]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    const away = () => close(false);
    // Every item can be greyed (signed out, Export locked): the focus then stays on Save, and Escape still closes.
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  function onKeyDown(e: KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(list.length - 1);
    else if (e.key === "Tab") close(false);
    else return;
    e.stopPropagation();
    if (e.key !== "Tab") e.preventDefault();
  }

  /** Runs a choice and closes the menu; the focus goes back to Save. */
  const choose = (run: () => void) => () => {
    close(true);
    run();
  };

  const accountOff = account !== null && (!account.signedIn || account.locked !== undefined);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Save"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="Save: to your account, or to a file"
        onClick={() => (open ? close(false) : setOpen(true))}
        className={buttonClassName}
      >
        <SkinIcon name="download" />
        <span className={wordClassName}>Save</span>
        <SkinIcon name="chevron-down" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label="Save"
            onKeyDown={onKeyDown}
            style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden" }}
            className="fixed z-50 flex w-[280px] max-w-[calc(100vw-16px)] flex-col gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-lg"
          >
            {account && (
              <div role="group" aria-labelledby={`${id}-account`} data-testid="save-account-group">
                <div id={`${id}-account`} className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                  Account
                </div>
                <div
                  data-feature-locked={account.locked !== undefined ? SAVE_TO_ACCOUNT_FEATURE : undefined}
                  title={account.locked}
                  className="flex flex-col"
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-label="Save"
                    aria-describedby={account.saved ? `${id}-saved` : undefined}
                    disabled={busy || accountOff}
                    onClick={choose(account.save)}
                    title={
                      account.saved
                        ? "Save over the chart saved to your account, whatever it is called now"
                        : "Save this chart to your account"
                    }
                    className={ITEM}
                  >
                    Save
                    {account.saved && (
                      <span id={`${id}-saved`} className="text-[11px] text-muted" data-testid="saved-to-account">
                        Saved {formatSavedAt(account.saved.savedAt)}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy || accountOff || !account.saved}
                    onClick={choose(account.saveCopy)}
                    title={
                      account.saved
                        ? "Save a new chart to your account from this one, and carry on with the copy"
                        : "Save the chart to your account first; then a copy of it can be saved"
                    }
                    className={ITEM}
                  >
                    Save as copy
                  </button>
                </div>
                {!account.signedIn && account.locked === undefined && (
                  <p className="m-0 px-2.5 pt-0.5 pb-1 text-[12px] leading-[17px] text-muted" data-testid="save-sign-in-note">
                    <Link href="/login" className="text-accent underline-offset-2 hover:underline">
                      Sign in
                    </Link>{" "}
                    to save charts to your account.
                  </p>
                )}
              </div>
            )}
            {account && toFile && <div className="mx-1 my-0.5 h-px bg-line" aria-hidden="true" />}
            {toFile && (
              <div role="group" aria-labelledby={`${id}-file`}>
                <div id={`${id}-file`} className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                  File
                </div>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy || toFile.locked !== undefined}
                  data-feature-locked={toFile.locked !== undefined ? "workspace.export" : undefined}
                  onClick={choose(toFile.run)}
                  title={toFile.locked ?? "Download the editable pattern (.json), which opens here again with everything in it"}
                  className={ITEM}
                >
                  Save to file
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
