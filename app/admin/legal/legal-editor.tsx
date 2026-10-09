"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PillButton } from "@/app/components/ui";
import { ContentProse } from "@/app/components/content-prose";
import { publishLegalVersionAction } from "@/lib/admin/legal-actions";
import type { LegalKind } from "@/lib/legal/documents";

/** The admin's form for each legal document (G-128 M1, D383): write, preview, then publish after a confirmation. */

export interface LegalDocumentRow {
  kind: LegalKind;
  label: string;
  note: string;
  path: string | null;
  /** The version in force; 0 when none is published. */
  version: number;
  body: string;
  /** "Version 2, in force since 9 October 2026, by a@example.com", or null when none is published. */
  inForce: string | null;
}

export function LegalEditor({ rows }: { rows: LegalDocumentRow[] }) {
  return (
    <div className="flex flex-col gap-4" data-testid="legal-editor">
      {rows.map((row) => (
        // Keyed by the version, so a publish starts the form again from the text now in force.
        <LegalForm key={`${row.kind}:${row.version}`} row={row} />
      ))}
    </div>
  );
}

function LegalForm({ row }: { row: LegalDocumentRow }) {
  const [text, setText] = useState(row.body);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const next = row.version + 1;

  const publish = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await publishLegalVersionAction(row.kind, text, row.version);
      if (result.error) setProblem(result.error);
      setConfirming(false);
    });
  };

  return (
    <section
      className="flex max-w-3xl flex-col gap-2.5 rounded-lg border border-line bg-surface p-3.5"
      data-testid="legal-document"
      data-kind={row.kind}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-medium text-ink">{row.label}</h2>
        {row.path && (
          <Link href={row.path} className="text-xs text-accent hover:text-accent-hover hover:underline">
            {row.path}
          </Link>
        )}
      </div>
      <p className="m-0 text-[13px] text-muted">{row.note}</p>
      <p className="m-0 text-[13px] text-ink" data-testid="legal-in-force">
        {row.inForce ?? "None published yet."}
      </p>
      {problem && (
        <p role="alert" className="m-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      {previewing ? (
        <div className="rounded-md border border-line bg-app px-3 py-2" data-testid="legal-preview">
          <ContentProse markdown={text} authored />
        </div>
      ) : (
        <textarea
          aria-label={`Text of the ${row.label.toLowerCase()}`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setConfirming(false);
          }}
          rows={row.kind === "withdrawal" ? 3 : 12}
          className="w-full rounded-md border border-control-line bg-control px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PillButton type="button" size="sm" variant="outline" onClick={() => setPreviewing((on) => !on)}>
          {previewing ? "Edit" : "Preview"}
        </PillButton>
        {confirming ? (
          <>
            <span className="text-[13px] text-ink">Publish as version {next}? It cannot be changed afterwards.</span>
            <PillButton type="button" size="sm" disabled={pending} onClick={publish}>
              Confirm publish
            </PillButton>
            <PillButton type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Keep editing
            </PillButton>
          </>
        ) : (
          <PillButton type="button" size="sm" disabled={pending || text.trim() === ""} onClick={() => setConfirming(true)}>
            Publish version {next}
          </PillButton>
        )}
        <span className="text-[12px] text-muted">Markdown; any HTML is shown as text.</span>
      </div>
    </section>
  );
}
