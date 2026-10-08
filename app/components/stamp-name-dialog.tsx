"use client";

import { useRef, useState, type FormEvent } from "react";
import { STAMP_NAME_MAX, UNTITLED_STAMP } from "@/lib/stamps/stamp";
import { useModalFocus } from "../hooks/use-modal-focus";
import { PillButton } from "./ui";

/**
 * Save as stamp asks for the stamp's name first (G-119). Enter saves, Escape and Cancel keep nothing; an empty name is
 * kept as "Untitled stamp", as an unnamed chart is.
 */

export interface StampNameDialogProps {
  /** "24 × 18 · 5 threads", what is about to be kept. */
  facts: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function StampNameDialog({ facts, onSave, onCancel }: StampNameDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  useModalFocus(panelRef, "input", onCancel);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(name);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        aria-labelledby="stamp-name-title"
        data-testid="stamp-name-dialog"
        className="flex w-[420px] max-w-full flex-col gap-3.5 rounded-xl border border-line bg-surface p-[22px] shadow-[0_30px_70px_color-mix(in_srgb,var(--at-shadow)_60%,transparent)]"
      >
        <h3 id="stamp-name-title" className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">
          Save as stamp
        </h3>
        <p className="m-0 text-[13px] leading-[19px] text-muted">
          The piece ({facts}) is kept with your account, to place in any chart. Its threads come with it.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-[13px] text-ink">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={UNTITLED_STAMP}
              maxLength={STAMP_NAME_MAX}
              className="rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink placeholder:text-faint"
            />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
            <PillButton size="md" onClick={onCancel}>
              Cancel
            </PillButton>
            <PillButton variant="primary" size="md" type="submit">
              Save stamp
            </PillButton>
          </div>
        </form>
      </div>
    </div>
  );
}
