"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PillButton } from "@/app/components/ui";

/**
 * The pieces register and login share (G-075): a labeled field and the submit button's pending state. The
 * two forms have different fields (register also asks for a name) and different actions, so each page keeps
 * its own `<form>` and `useActionState` call rather than being forced through one generic shell -- what's
 * shared here is genuinely identical between them, not similar-shaped.
 */

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <h1 className="mb-5 text-lg font-semibold text-ink">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function AuthField({
  id,
  name,
  label,
  type = "text",
  defaultValue,
  autoComplete,
  error,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="rounded-md border border-control-line bg-control px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    // A plain `role="alert"` also matches Next's own route announcer div, so tests need a selector of their
    // own rather than fighting that ambiguity per call site.
    <p
      role="alert"
      data-testid="auth-error"
      className="mb-4 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300"
    >
      {message}
    </p>
  );
}

/** `useFormStatus` reads the nearest enclosing `<form>`'s pending state, so this has to be the form's child. */
export function AuthSubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <PillButton type="submit" variant="primary" size="md" disabled={pending} className="w-full justify-center">
      {pending ? "Working…" : children}
    </PillButton>
  );
}
