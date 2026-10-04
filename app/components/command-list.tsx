"use client";

import { useEffect, useRef, useState } from "react";
import { COMMAND_GROUPS, keysLabel, searchCommands, type Command } from "@/lib/editor/commands";

/**
 * The command list (G-093, D287): every command the editor has, searchable, each with its key and whether it can be used
 * now. It draws the command table and nothing else; a command appears here by being registered.
 *
 * Focus stays in the search field for as long as the list is open, so the arrow keys, Enter and Escape belong to the list and
 * typing never reaches the chart's shortcuts. A command that cannot be used now is shown with the reason in words; one that
 * only makes sense as a key press (held, or in the middle of a drag) is shown with its key and is not run from here.
 */

export interface CommandListProps {
  commands: readonly Command[];
  /** `ran` says a command was run, which decides where the focus goes. */
  onClose: (ran: boolean) => void;
}

const optionId = (id: string) => `command-${id.replace(/\./g, "-")}`;

export function CommandList({ commands, onClose }: CommandListProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const found = searchCommands(commands, query);
  const runnable = found.filter((command) => command.available && !command.keyOnly);
  const active = runnable[Math.min(activeIndex, runnable.length - 1)] ?? null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The highlighted command stays in sight as the arrow keys move it.
  useEffect(() => {
    if (active) document.getElementById(optionId(active.id))?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(command: Command) {
    // Closed first: the command acts on the editor as it is without the list over it, and may open something of its own.
    onClose(true);
    command.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose(false);
    } else if (e.key === "Tab") {
      // The field is the one thing here that takes the focus, and the page behind is not to be reached while the list is up.
      e.preventDefault();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (runnable.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((Math.min(activeIndex, runnable.length - 1) + step + runnable.length) % runnable.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active) run(active);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[12vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        onKeyDown={onKeyDown}
        className="flex max-h-[70vh] w-[520px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_30px_70px_rgba(0,0,0,.6)]"
      >
        <div className="flex items-center gap-2 border-b border-line p-3">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search commands"
            aria-expanded="true"
            aria-controls="command-list-options"
            aria-activedescendant={active ? optionId(active.id) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search commands"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            // A press on a row must not take the focus away from the field; the row still gets its click.
            onBlur={(e) => e.relatedTarget === null && e.target.focus()}
            className="min-w-0 flex-1 rounded-md border border-line bg-app px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <span className="shrink-0 font-mono text-[11px] text-faint" aria-live="polite">
            {found.length} of {commands.length}
          </span>
        </div>

        <div id="command-list-options" role="listbox" aria-label="Commands" className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {found.length === 0 && <p className="m-0 px-4 py-3 text-[13px] text-muted">No command matches.</p>}
          {COMMAND_GROUPS.map((group) => {
            const inGroup = found.filter((command) => command.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} role="group" aria-label={group}>
                <div className="px-4 pt-2 pb-1 text-[10px] font-medium tracking-wider text-faint uppercase" aria-hidden="true">
                  {group}
                </div>
                {inGroup.map((command) => {
                  const canRun = command.available && !command.keyOnly;
                  const isActive = command === active;
                  const note = command.keyOnly ? "From the keyboard only" : command.available ? null : command.when;
                  return (
                    <div
                      key={command.id}
                      id={optionId(command.id)}
                      role="option"
                      aria-selected={isActive}
                      aria-disabled={!canRun}
                      data-command={command.id}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => canRun && run(command)}
                      onPointerMove={() => {
                        const index = runnable.indexOf(command);
                        if (index >= 0 && index !== activeIndex) setActiveIndex(index);
                      }}
                      className={`flex items-baseline gap-3 px-4 py-1.5 text-[13px] ${
                        canRun ? "cursor-pointer text-ink" : "cursor-default text-faint"
                      } ${isActive ? "bg-raised" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        {command.name}
                        {note && <span className="block text-[11px] leading-[15px] text-faint">{note}</span>}
                      </span>
                      {command.keys && <kbd className="shrink-0 font-mono text-[11px] text-muted">{keysLabel(command)}</kbd>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
