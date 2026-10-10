// The site's seeded thread systems as the tests use them (G-132, D400): read from the fixtures the migration's seed was
// written from, since no list is compiled into the app any more.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ThreadSystemInfo } from "@/lib/threads/thread-brands";

interface Fixture {
  key: string;
  label: string;
  note: string | null;
  threads: [string, string, string][];
}

const KEYS = ["dmc", "cosmo", "anchor"] as const;
const dir = path.resolve(__dirname, "../../fixtures/thread-systems");
const fixtures: Fixture[] = KEYS.map((key) => JSON.parse(readFileSync(path.join(dir, `${key}.json`), "utf8")));

const rgb = (hex: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** The three seeded systems as the browser's registry holds them. */
export const SEEDED_SYSTEMS: readonly ThreadSystemInfo[] = fixtures.map((f) => ({
  id: f.key,
  label: f.label,
  ...(f.note ? { note: f.note } : {}),
  colors: f.threads.map(([code, name, hex]) => ({ code, name, rgb: rgb(hex) })),
}));

/** A seeded system's threads by key. */
export function seededColors(key: (typeof KEYS)[number]) {
  return SEEDED_SYSTEMS.find((s) => s.id === key)!.colors;
}

/** The seeded systems as the server adds them to a generation request: `threadSystems: [{key, threads}]`. */
export function requestSystems(keys: readonly string[] = KEYS): { key: string; threads: [string, string, string][] }[] {
  return fixtures.filter((f) => keys.includes(f.key)).map((f) => ({ key: f.key, threads: f.threads }));
}

/** The seeded systems' labels as the server adds them to an export request. */
export function requestLabels(): [string, string][] {
  return fixtures.map((f) => [f.key, f.label]);
}
