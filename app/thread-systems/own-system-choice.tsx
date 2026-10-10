"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OwnSystemUpload } from "./own-system-upload";
import { useMayAddThreadSystem, useThreadSystems } from "./thread-systems-context";

const FIELD = "min-w-0 flex-1 rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink";

/**
 * A person's own thread systems (G-132 M4, D402), under the site's wherever a system is chosen: from a list, since there
 * may be ten of them. Where `upload` is set (the editor's Palette) one is uploaded from here as from the account.
 */
export function OwnSystemChoice({ value, onChoose, upload = false }: { value: string; onChoose: (key: string) => void; upload?: boolean }) {
  const own = useThreadSystems().filter((system) => system.own);
  const mayAdd = useMayAddThreadSystem() && upload;
  if (own.length === 0 && !mayAdd) return null;

  return (
    <div className="flex flex-col gap-1.5" data-testid="own-system-choice">
      {own.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted">
          Yours
          <select
            aria-label="Your thread systems"
            value={own.some((system) => system.id === value) ? value : ""}
            onChange={(event) => {
              if (event.target.value) onChoose(event.target.value);
            }}
            className={FIELD}
          >
            <option value="">Choose one of yours…</option>
            {own.map((system) => (
              <option key={system.id} value={system.id}>
                {system.label} ({system.colors.length})
              </option>
            ))}
          </select>
        </label>
      )}
      {mayAdd && <OwnSystemAdder onChoose={onChoose} />}
    </div>
  );
}

/** The upload, opened on purpose. A system just uploaded is chosen, and the page's systems are read again so every picker has it. */
function OwnSystemAdder({ onChoose }: { onChoose: (key: string) => void }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="w-fit text-[12px] text-accent hover:text-accent-hover hover:underline"
      >
        Add a thread system of your own
      </button>
    );
  }
  return (
    <OwnSystemUpload
      onAdded={(system) => {
        setAdding(false);
        onChoose(system.key);
        router.refresh();
      }}
      onCancel={() => setAdding(false)}
    />
  );
}
