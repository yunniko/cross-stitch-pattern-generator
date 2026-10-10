import { threadListCsv, threadSystemJson } from "@/lib/thread-systems/thread-list-file";
import type { ThreadRow } from "@/lib/thread-systems/thread-system";

/** A system's details and threads, as a download names and writes them. */
export interface DownloadableSystem {
  key: string;
  label: string;
  note?: string | null;
  source?: string | null;
  licence?: string | null;
  threads: readonly ThreadRow[];
}

/**
 * Downloads a thread system as the file it can be uploaded from again (G-132, D401): a CSV of number, name and colour, or
 * JSON with its details. Named by its key, which reads as a file name.
 */
export function downloadThreadSystem(system: DownloadableSystem, kind: "csv" | "json"): void {
  const { key, label, threads } = system;
  const details = { label, note: system.note ?? undefined, source: system.source ?? undefined, licence: system.licence ?? undefined };
  const text = kind === "csv" ? threadListCsv(threads) : threadSystemJson(details, threads);
  const url = URL.createObjectURL(new Blob([text], { type: kind === "csv" ? "text/csv" : "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${key}.${kind}`;
  link.click();
  URL.revokeObjectURL(url);
}
