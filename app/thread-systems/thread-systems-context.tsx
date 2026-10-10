"use client";

import { createContext, useContext, type ReactNode } from "react";
import { loadThreadSystems, type ThreadSystemInfo } from "@/lib/threads/thread-brands";

/**
 * The thread systems the person may use (G-132, D400), as the server read them from its table when it drew the page. Lists
 * that are drawn (a picker's systems, a mode's choices) read them from here, so the server's markup and the browser's
 * agree. The browser also loads them into the registry (`lib/threads/thread-brands.ts`) for the code that looks a thread
 * up outside a component; the server never does, since its module is shared by everyone's requests.
 */
const ThreadSystemsContext = createContext<readonly ThreadSystemInfo[]>([]);
const MayAddContext = createContext(false);

export function ThreadSystemsProvider({
  systems,
  mayAdd = false,
  children,
}: {
  systems: readonly ThreadSystemInfo[];
  /** Whether the person may upload a system of their own (G-132 M4): signed in, with the switch on. */
  mayAdd?: boolean;
  children: ReactNode;
}) {
  // In render, not an effect: the children's first render already looks threads up. Loading the same list again is a no-op.
  if (typeof window !== "undefined") loadThreadSystems(systems);
  return (
    <ThreadSystemsContext.Provider value={systems}>
      <MayAddContext.Provider value={mayAdd}>{children}</MayAddContext.Provider>
    </ThreadSystemsContext.Provider>
  );
}

/** Whether the person may upload a system of their own. */
export function useMayAddThreadSystem(): boolean {
  return useContext(MayAddContext);
}

/** The systems the person may use, in the order offered: the site's, then their own (`own`). */
export function useThreadSystems(): readonly ThreadSystemInfo[] {
  return useContext(ThreadSystemsContext);
}
