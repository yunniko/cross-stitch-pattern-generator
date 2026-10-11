"use client";

import { useState, type ChangeEvent } from "react";
import { PillButton } from "@/app/components/ui";
import { apiJson } from "@/lib/api-json";
import { readOwnSystemUpload, type OwnSystem } from "@/lib/thread-systems/own-system";
import { readThreadList, THREAD_FILE_MAX_BYTES } from "@/lib/thread-systems/thread-list-file";
import { SYSTEM_LABEL_MAX } from "@/lib/thread-systems/thread-system";

const FIELD = "min-w-0 rounded-md border border-control-line bg-control px-2 py-1 text-[13px] text-ink";

/**
 * Uploading a thread system of one's own (G-132 M4, D402), the same in the account and in the editor's Palette: a CSV
 * (number, name, colour) or JSON file is read and checked here by the rules the server applies again, named, and kept.
 */
export function OwnSystemUpload({
  onAdded,
  onCancel,
}: {
  onAdded: (system: OwnSystem) => void;
  /** Given where the upload was opened on purpose (the editor): Cancel then closes it, with or without a file. */
  onCancel?: () => void;
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const read = file && readOwnSystemUpload({ name, text: file.text });

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    setProblem(null);
    if (chosen.size > THREAD_FILE_MAX_BYTES) {
      setFile(null);
      setProblem(`The file is larger than ${THREAD_FILE_MAX_BYTES / 1024} KB.`);
      return;
    }
    const text = await chosen.text();
    const listed = readThreadList(text);
    // The name the file gives, or else the file's own name.
    const named = ("details" in listed && listed.details.label) || chosen.name.replace(/\.[^.]*$/, "");
    setName(named.slice(0, SYSTEM_LABEL_MAX));
    setFile({ name: chosen.name, text });
  }

  async function keep() {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    const answer = await apiJson<OwnSystem>(
      "/api/thread-systems",
      { method: "POST", json: { name, text: file.text } },
      {
        refused: "That did not work. Try again in a moment.",
        unreachable: "Couldn't reach the server. Check your connection and try again.",
      }
    );
    setBusy(false);
    if (!answer.ok) return setProblem(answer.error);
    setFile(null);
    setName("");
    onAdded(answer.body);
  }

  return (
    <div className="flex flex-col gap-2" data-testid="own-system-upload">
      <label className="w-fit cursor-pointer text-[13px] text-accent hover:text-accent-hover hover:underline">
        {file ? `Another file instead of ${file.name}` : "Upload a thread system (CSV or JSON)"}
        <input
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json"
          className="sr-only"
          onChange={(event) => void choose(event)}
          data-testid="own-system-file"
        />
      </label>
      {file && (
        <>
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Name
            <input
              className={FIELD}
              value={name}
              maxLength={SYSTEM_LABEL_MAX}
              onChange={(event) => setName(event.target.value)}
              data-testid="own-system-name"
            />
          </label>
          <span
            className={`text-[12px] ${read && "error" in read ? "text-danger" : "text-muted"}`}
            aria-live="polite"
            data-testid="own-system-check"
          >
            {read && ("error" in read ? read.error : `${read.threads.length} threads read.`)}
          </span>
        </>
      )}
      {(file || onCancel) && (
        <div className="flex gap-2">
          {file && (
            <PillButton size="sm" variant="primary" disabled={busy || !read || "error" in read} onClick={() => void keep()}>
              Keep it
            </PillButton>
          )}
          <PillButton
            size="sm"
            disabled={busy}
            onClick={() => {
              setFile(null);
              setProblem(null);
              onCancel?.();
            }}
          >
            Cancel
          </PillButton>
        </div>
      )}
      {problem && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
