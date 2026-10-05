import type { ReactNode } from "react";

/**
 * Where each region of the editor sits (G-095, proposal D). **This is the only component that places a region**: the
 * regions themselves (the bar above, the tools, the tool options, the stage with the view controls over it, the readout,
 * the panel) know nothing of where they are put. A layout for another kind of screen is another one of these, given the
 * same regions (the provision for a phone layout: Owner, 2026-10-05).
 *
 *   ┌───────────────────────── appBar ─────────────────────────┐
 *   │ tools │ quickBar                                 │ panel  │
 *   │       │ notices                                  │        │
 *   │       │ stage (viewControls over its foot)       │        │
 *   │       │ strip                                    │        │
 *   │       │ readout                                  │        │
 *   └───────┴──────────────────────────────────────────┴────────┘
 */
export interface EditorLayoutProps {
  appBar: ReactNode;
  tools: ReactNode;
  quickBar: ReactNode;
  /** Messages that belong to no one control. */
  notices: ReactNode;
  stage: ReactNode;
  /** Floats over the foot of the stage; null when there is no chart to look at. */
  viewControls: ReactNode;
  /** Under the stage, for what a workspace keeps there (the tries, in Photo). */
  strip?: ReactNode;
  readout: ReactNode;
  panel: ReactNode;
}

export function EditorLayout({ appBar, tools, quickBar, notices, stage, viewControls, strip = null, readout, panel }: EditorLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {appBar}
      <div className="flex min-h-0 flex-1">
        {tools}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {quickBar}
          {notices}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {stage}
            {viewControls}
          </div>
          {strip}
          {readout}
        </main>
        {panel}
      </div>
    </div>
  );
}
