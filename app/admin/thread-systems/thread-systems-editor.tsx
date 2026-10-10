"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { PillButton } from "@/app/components/ui";
import { createThreadSystemAction, deleteThreadSystemAction, updateThreadSystemAction } from "@/lib/admin/thread-system-actions";
import { downloadThreadSystem } from "@/app/thread-systems/thread-system-download";
import { readThreadList, THREAD_FILE_MAX_BYTES, threadListCsv } from "@/lib/thread-systems/thread-list-file";
import { SYSTEM_KEY_MAX, SYSTEM_LABEL_MAX, SYSTEM_TEXT_MAX, type ThreadRow } from "@/lib/thread-systems/thread-system";

/**
 * The admin's thread systems (G-132 M3, D401): each with its details and threads; a form to add one from a file or a
 * typed list, and the same form to edit one. The list is checked as it is typed, by the rules the server applies again.
 */

export interface ThreadSystemRow {
  key: string;
  label: string;
  note: string;
  source: string;
  licence: string;
  threads: ThreadRow[];
  updatedAt: string;
}

const FIELD = "w-full rounded-md border border-control-line bg-control px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent";

export function ThreadSystemsEditor({ systems }: { systems: ThreadSystemRow[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4" data-testid="thread-systems">
      {adding ? (
        <SystemForm mode="add" onDone={() => setAdding(false)} />
      ) : (
        <div>
          <PillButton type="button" size="sm" variant="primary" onClick={() => setAdding(true)}>
            Add a system
          </PillButton>
        </div>
      )}
      {systems.length === 0 && <p className="m-0 text-[13px] text-muted">No thread systems: the editor offers only the full range.</p>}
      {systems.map((system) => (
        // Keyed by the save time, so an edit opens again from what was saved.
        <SystemCard key={`${system.key}:${system.updatedAt}`} system={system} />
      ))}
    </div>
  );
}

function SystemCard({ system }: { system: ThreadSystemRow }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) return <SystemForm mode="edit" system={system} onDone={() => setEditing(false)} />;

  const remove = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await deleteThreadSystemAction(system.key);
      if (result.error) setProblem(result.error);
      setConfirming(false);
    });
  };

  return (
    <section
      className="flex max-w-3xl flex-col gap-2 rounded-lg border border-line bg-surface p-3.5"
      data-testid="thread-system"
      data-key={system.key}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="m-0 text-base font-medium text-ink">{system.label}</h2>
        <span className="font-mono text-[12px] text-muted">{system.key}</span>
        <span className="text-[13px] text-muted" data-testid="thread-system-count">
          {system.threads.length} threads
        </span>
        <span className="text-[12px] text-faint">changed {system.updatedAt.slice(0, 10)}</span>
      </div>
      <div className="flex flex-wrap gap-px" aria-hidden>
        {system.threads.slice(0, 60).map(([code, , hex]) => (
          <span key={code} className="h-3 w-3" style={{ background: `#${hex}` }} />
        ))}
      </div>
      {system.note && <p className="m-0 text-[13px] text-ink">{system.note}</p>}
      {(system.source || system.licence) && (
        <p className="m-0 text-[12px] text-muted">
          {system.source && <>Source: {system.source}. </>}
          {system.licence && <>Licence: {system.licence}.</>}
        </p>
      )}
      {problem && (
        <p role="alert" className="m-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PillButton type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </PillButton>
        <PillButton type="button" size="sm" variant="outline" onClick={() => downloadThreadSystem(system, "csv")}>
          Download CSV
        </PillButton>
        <PillButton type="button" size="sm" variant="outline" onClick={() => downloadThreadSystem(system, "json")}>
          Download JSON
        </PillButton>
        {confirming ? (
          <>
            <span className="text-[13px] text-ink">Delete {system.label}? Its switches go with it; charts keep its colours by number.</span>
            <PillButton type="button" size="sm" variant="primary" disabled={pending} onClick={remove}>
              Confirm delete
            </PillButton>
            <PillButton type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Keep it
            </PillButton>
          </>
        ) : (
          <PillButton type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Delete
          </PillButton>
        )}
      </div>
    </section>
  );
}

type FormProps = { mode: "add"; system?: undefined; onDone: () => void } | { mode: "edit"; system: ThreadSystemRow; onDone: () => void };

function SystemForm({ mode, system, onDone }: FormProps) {
  const original = useMemo(() => (system ? threadListCsv(system.threads) : ""), [system]);
  const [key, setKey] = useState(system?.key ?? "");
  const [label, setLabel] = useState(system?.label ?? "");
  const [note, setNote] = useState(system?.note ?? "");
  const [source, setSource] = useState(system?.source ?? "");
  const [licence, setLicence] = useState(system?.licence ?? "");
  const [list, setList] = useState(original);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const read = useMemo(() => (list.trim() === "" ? null : readThreadList(list)), [list]);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > THREAD_FILE_MAX_BYTES) {
      setProblem(`The file is larger than ${THREAD_FILE_MAX_BYTES / 1024} KB.`);
      return;
    }
    setProblem(null);
    const text = await file.text();
    setList(text);
    // A file that names its system fills what is still empty; what was typed stays.
    const fromFile = readThreadList(text);
    if ("details" in fromFile) {
      if (!label && fromFile.details.label) setLabel(fromFile.details.label.slice(0, SYSTEM_LABEL_MAX));
      if (!note && fromFile.details.note) setNote(fromFile.details.note);
      if (!source && fromFile.details.source) setSource(fromFile.details.source);
      if (!licence && fromFile.details.licence) setLicence(fromFile.details.licence);
    }
    if (mode === "add" && !key) {
      const stem = file.name
        .replace(/\.[^.]*$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setKey(stem.slice(0, SYSTEM_KEY_MAX));
    }
  };

  const save = () => {
    setProblem(null);
    const details = { label, note, source, licence };
    startTransition(async () => {
      const result =
        mode === "add"
          ? await createThreadSystemAction(key, details, list)
          : await updateThreadSystemAction(system.key, details, list === original ? null : list);
      if (result.error) setProblem(result.error);
      else onDone();
    });
  };

  const field = (name: string, value: string, set: (value: string) => void, max: number, testId: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-muted">
      {name}
      <input className={FIELD} value={value} maxLength={max} onChange={(event) => set(event.target.value)} data-testid={testId} />
    </label>
  );

  return (
    <section
      className="flex max-w-3xl flex-col gap-2.5 rounded-lg border border-accent/50 bg-surface p-3.5"
      data-testid="thread-system-form"
    >
      <h2 className="m-0 text-base font-medium text-ink">{mode === "add" ? "A new thread system" : `Editing ${system.label}`}</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {mode === "add" ? (
          field("Key (stored in charts; cannot be changed later)", key, setKey, SYSTEM_KEY_MAX, "thread-system-key")
        ) : (
          <p className="m-0 self-end text-[12px] text-muted">
            Key <span className="font-mono text-ink">{system.key}</span>, stored in charts, so it stays.
          </p>
        )}
        {field("Name", label, setLabel, SYSTEM_LABEL_MAX, "thread-system-label")}
      </div>
      {field("Note shown with it (optional)", note, setNote, SYSTEM_TEXT_MAX, "thread-system-note")}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {field("Source (optional)", source, setSource, SYSTEM_TEXT_MAX, "thread-system-source")}
        {field("Licence (optional)", licence, setLicence, SYSTEM_TEXT_MAX, "thread-system-licence")}
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-muted">
        Threads: one a line, as number, name, colour (#rrggbb); or a JSON list
        <textarea
          className={`${FIELD} font-mono`}
          rows={8}
          value={list}
          onChange={(event) => setList(event.target.value)}
          placeholder="number,name,hex"
          data-testid="thread-system-list"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer text-[13px] text-accent hover:text-accent-hover hover:underline">
          Read a file (CSV or JSON)
          <input
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json"
            className="sr-only"
            onChange={chooseFile}
            data-testid="thread-system-file"
          />
        </label>
        <span
          className={`text-[13px] ${read && "error" in read ? "text-danger" : "text-muted"}`}
          data-testid="thread-system-check"
          aria-live="polite"
        >
          {read === null ? "No threads yet." : "error" in read ? read.error : `${read.threads.length} threads read.`}
        </span>
      </div>
      {problem && (
        <p role="alert" className="m-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PillButton
          type="button"
          size="sm"
          variant="primary"
          disabled={pending || read === null || "error" in read || label.trim() === "" || (mode === "add" && key === "")}
          onClick={save}
        >
          {mode === "add" ? "Add the system" : "Save"}
        </PillButton>
        <PillButton type="button" size="sm" variant="outline" disabled={pending} onClick={onDone}>
          Cancel
        </PillButton>
      </div>
    </section>
  );
}
