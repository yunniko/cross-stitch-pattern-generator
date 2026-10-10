import { useState } from "react";
import { THREAD_BRANDS, THREAD_BRAND_IDS, THREAD_CODE_MAX, threadIdentity, type ThreadBrand } from "@/lib/threads/thread-brands";
import type { ThreadSwatchRef } from "@/lib/types";
import { useGatedOptions } from "../features/features-context";
import { brandFeature } from "../features/registry";

const FIELD = "rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink disabled:opacity-50";

export interface ThreadFieldsProps {
  /** The colour's thread as it is now. */
  source: ThreadSwatchRef | undefined;
  /** A finished change: the thread typed or chosen, or null to say the colour is no particular thread. */
  onCommit: (thread: ThreadSwatchRef | null) => void;
}

/**
 * A colour's thread by hand (G-131): its system and its number, typed. The number never changes the colour, and one no
 * catalogue lists is kept as typed. A number needs a system, so the number waits while the system is None.
 */
export function ThreadFields({ source, onCommit }: ThreadFieldsProps) {
  // Keyed on the thread as it is: a pick in the grid, an undo or a Cancel shows the new one instead of a stale draft.
  return <ThreadFieldsDraft key={`${source?.brand ?? ""}:${source?.code ?? ""}`} source={source} onCommit={onCommit} />;
}

function ThreadFieldsDraft({ source, onCommit }: ThreadFieldsProps) {
  const [system, setSystem] = useState<ThreadBrand | "">(source?.brand ?? "");
  const [number, setNumber] = useState(source?.code ?? "");
  const systems = useGatedOptions(
    THREAD_BRAND_IDS.map((brand) => ({ value: brand, label: THREAD_BRANDS[brand].label })),
    brandFeature
  );

  function commit(nextSystem: ThreadBrand | "", nextNumber: string) {
    const thread = nextSystem === "" || nextNumber.trim() === "" ? null : threadIdentity(nextSystem, nextNumber);
    if (thread?.brand === source?.brand && thread?.code === source?.code) {
      setNumber(source?.code ?? ""); // a number only trimmed or recased to the one already there
      return;
    }
    // A system chosen before its number waits for the number rather than clearing the thread there is.
    if (thread === null && nextSystem !== "" && nextNumber.trim() === "" && source === undefined) return;
    onCommit(thread);
  }

  return (
    <div className="flex items-center gap-2" data-testid="thread-fields">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        System
        <select
          aria-label="Thread system"
          value={system}
          onChange={(e) => {
            const next = e.target.value as ThreadBrand | "";
            setSystem(next);
            commit(next, number);
          }}
          className={FIELD}
        >
          <option value="">None</option>
          {systems.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled} title={option.title}>
              {option.label}
            </option>
          ))}
          {/* A system now hidden or locked still names the thread this colour already is. */}
          {source && !systems.some((option) => option.value === source.brand) && (
            <option value={source.brand}>{THREAD_BRANDS[source.brand].label}</option>
          )}
        </select>
      </label>
      <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted">
        Number
        <input
          type="text"
          aria-label="Thread number"
          value={number}
          maxLength={THREAD_CODE_MAX}
          disabled={system === ""}
          placeholder={system === "" ? "Choose a system" : "e.g. 310"}
          onChange={(e) => setNumber(e.target.value)}
          onBlur={() => commit(system, number)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(system, number);
          }}
          className={`${FIELD} min-w-0 flex-1`}
        />
      </label>
    </div>
  );
}
