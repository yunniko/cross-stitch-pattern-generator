"use client";

import { apiJson, type ApiRequest } from "@/lib/api-json";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHead } from "@/app/components/panel/panel-parts";
import { PillButton } from "@/app/components/ui";
import { OwnSystemUpload } from "@/app/thread-systems/own-system-upload";
import { downloadThreadSystem } from "@/app/thread-systems/thread-system-download";
import type { OwnSystem } from "@/lib/thread-systems/own-system";
import { SYSTEM_LABEL_MAX } from "@/lib/thread-systems/thread-system";

/**
 * The account's Thread systems (G-132 M4, D402): an upload, then each system with its threads' colours, to rename,
 * download as CSV or JSON, or delete. Each change goes to the system's route and the page is read again; delete asks
 * first, as it cannot be undone.
 */
export function OwnSystemList({ systems, allowed, lead }: { systems: readonly OwnSystem[]; allowed: string; lead: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Thread systems" lead={lead} />
      <span className="font-mono text-xs text-faint" data-testid="own-system-count">
        {systems.length} {systems.length === 1 ? "system" : "systems"} · {allowed}
      </span>
      <OwnSystemUpload onAdded={() => router.refresh()} />
      {systems.length === 0 ? (
        <p className="m-0 rounded-lg border border-line px-3 py-5 text-center text-sm text-muted" data-testid="own-systems-empty">
          No thread systems of your own yet.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Your thread systems">
          {systems.map((system) => (
            <SystemCard key={`${system.id}:${system.savedAt}`} system={system} />
          ))}
        </ul>
      )}
      <p className="m-0 text-[13px] text-muted">
        A chart keeps the colours of a system you delete, with their numbers; editing one then opens the common colour picker.
      </p>
    </div>
  );
}

function SystemCard({ system }: { system: OwnSystem }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(system.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(init: ApiRequest) {
    setBusy(true);
    setError(null);
    const answer = await apiJson<unknown>(`/api/thread-systems/${encodeURIComponent(system.id)}`, init, {
      refused: "That did not work. Try again in a moment.",
      unreachable: "Couldn't reach the server. Check your connection and try again.",
    });
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    setMode("view");
    router.refresh();
  }

  const cancelRename = () => {
    setName(system.label);
    setMode("view");
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5" data-testid="own-system" data-key={system.key}>
      {mode === "rename" ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ method: "PATCH", json: { name } });
          }}
        >
          <label className="sr-only" htmlFor={`own-system-name-${system.id}`}>
            Thread system name
          </label>
          <input
            id={`own-system-name-${system.id}`}
            value={name}
            maxLength={SYSTEM_LABEL_MAX}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelRename();
            }}
            className="min-w-0 rounded-md border border-control-line bg-control px-2 py-1 text-[13px] text-ink"
          />
          <PillButton type="submit" variant="primary" size="sm" disabled={busy}>
            Save name
          </PillButton>
          <PillButton size="sm" onClick={cancelRename}>
            Cancel
          </PillButton>
        </form>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[15px] font-medium text-ink" data-testid="own-system-label">
            {system.label}
          </span>
          <span className="text-[13px] text-muted" data-testid="own-system-threads">
            {system.threads.length} {system.threads.length === 1 ? "thread" : "threads"}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-px" aria-hidden>
        {system.threads.slice(0, 60).map(([code, , hex]) => (
          <span key={code} className="h-3 w-3" style={{ background: `#${hex}` }} />
        ))}
      </div>
      {system.note && <p className="m-0 text-[13px] text-ink">{system.note}</p>}
      {mode !== "rename" && (
        <div className="flex flex-wrap items-center gap-2">
          <PillButton size="sm" disabled={busy} onClick={() => setMode("rename")}>
            Rename
          </PillButton>
          <PillButton size="sm" onClick={() => downloadThreadSystem(system, "csv")}>
            Download CSV
          </PillButton>
          <PillButton size="sm" onClick={() => downloadThreadSystem(system, "json")}>
            Download JSON
          </PillButton>
          <PillButton size="sm" disabled={busy} onClick={() => setMode("delete")}>
            Delete…
          </PillButton>
        </div>
      )}
      {mode === "delete" && (
        <div className="flex flex-col gap-2 pt-1" role="group" aria-label={`Delete ${system.label}?`}>
          <span className="text-[13px] text-ink">
            Delete “{system.label}” from your thread systems? Your charts keep its colours. This cannot be undone.
          </span>
          <div className="flex gap-2">
            <PillButton size="sm" onClick={() => setMode("view")} autoFocus>
              Keep it
            </PillButton>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ method: "DELETE" })}
              className="rounded-full border border-danger-strong bg-danger-edge px-3 py-1 text-xs text-on-danger hover:bg-danger-strong disabled:opacity-40"
            >
              Delete system
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
