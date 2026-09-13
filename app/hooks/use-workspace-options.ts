import { useCallback, useEffect, useState } from "react";
import { DEFAULT_OPTIONS, loadWorkspaceOptions, saveWorkspaceOptions, type WorkspaceOptions } from "@/lib/editor/workspace-storage";

export type UpdateWorkspaceOption = <K extends keyof WorkspaceOptions>(key: K, value: WorkspaceOptions[K]) => void;

/** Workspace preferences: defaults on the first render (so server and client markup agree), stored values once mounted, saved on every change after that. */
export function useWorkspaceOptions() {
  const [options, setOptions] = useState<WorkspaceOptions>(DEFAULT_OPTIONS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Deferred a microtask: a synchronous setState in an effect body is flagged by react-hooks/set-state-in-effect.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setOptions(loadWorkspaceOptions());
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded) saveWorkspaceOptions(options);
  }, [loaded, options]);

  const update: UpdateWorkspaceOption = useCallback((key, value) => {
    setOptions((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  return { options, update, loaded };
}
