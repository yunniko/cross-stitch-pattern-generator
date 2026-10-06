import type { FeatureDeclaration } from "../features/features";
/**
 * Commands (G-093, D286): an action the editor has, registered once with its name, its keys and when it is available. The
 * keyboard shortcuts and the command list both read the registered table; nothing else decides what a key does.
 *
 * This module is the pure half: what a command is, how a key is matched to one, and how the list is searched. The table
 * itself is `app/commands/registry.ts`, and each tool module adds its own.
 */

/** The order the groups are listed in. */
export const COMMAND_GROUPS = [
  "File",
  "Generate",
  "Edit",
  "Tools",
  "Selection",
  "Backstitch",
  "Crop",
  "Colours",
  "Chart",
  "View",
  "Keyboard cursor",
] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export interface CommandDefinition {
  /** Its identity: `group.action`, lower case. */
  id: string;
  name: string;
  group: CommandGroup;
  /** When it can be used, in words: what the list and the documents show. */
  when: string;
  /**
   * The keys that run it: `B`, `1`, `Mod+Z`, `Mod+Shift+Z`, `Escape`, `Enter`, `Delete`, `Backspace`, `Space`. `Mod` is Ctrl,
   * or Cmd on a Mac. For a command listened to `elsewhere` these are words to show, not keys this table matches.
   */
  keys?: readonly string[];
  /**
   * It acts on what is in hand (a piece, lines of backstitch), so its key may be another such command's as well: only one
   * thing is in hand at a time, and the first command that is available takes the press.
   */
  onHeld?: boolean;
  /**
   * It only makes sense as a key press, so the list shows it and does not run it: `held` acts for as long as the key is down,
   * `gesture` ends something the pointer is in the middle of, `elsewhere` is listened to by another part of the editor.
   */
  keyOnly?: "held" | "gesture" | "elsewhere";
  /**
   * The feature switch it is under (G-102). Left out, the command is a feature of its own, `command.<id>`, named after
   * itself; `null` is core, never switched; a string names the feature it belongs to (the four mirrors are one).
   */
  feature?: FeatureDeclaration;
}

export interface CommandState {
  available: boolean;
  /**
   * Its key is kept from the browser now, even though the command cannot run: undo with a piece in hand, Delete with the
   * backstitch tool in hand and nothing selected. A key is never kept on behalf of a tool nobody is holding.
   */
  claimsKey?: boolean;
  /** Returning false says the press was not this command's after all, and the next command on the same key is tried. */
  run: () => boolean | void;
  /** For a `held` command: the key came up. */
  release?: () => void;
}

export type Command = CommandDefinition & CommandState;

/** The part of a keyboard event a key is matched on. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface Chord {
  mod: boolean;
  shift: boolean;
  /** The event key it matches, lower case. */
  key: string;
  /** Escape, Enter, Delete, Backspace or Space, which act whatever modifiers are down. */
  named: boolean;
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  escape: "escape",
  enter: "enter",
  delete: "delete",
  backspace: "backspace",
  space: " ",
};

/** A key as written in the table, parsed. A key the table cannot mean is a registration mistake and fails by name. */
export function parseChord(text: string): Chord {
  const parts = text.split("+");
  const last = parts[parts.length - 1].toLowerCase();
  const modifiers = parts.slice(0, -1);
  const unknown = modifiers.find((part) => part !== "Mod" && part !== "Shift");
  const named = last in NAMED_KEYS;
  if (unknown !== undefined || (!named && !/^[a-z0-9]$/.test(last))) throw new Error(`"${text}" is not a key a command can have.`);
  return { mod: modifiers.includes("Mod"), shift: modifiers.includes("Shift"), key: named ? NAMED_KEYS[last] : last, named };
}

/**
 * How well a press matches a key: 2 exactly, 1 with Shift held that the key does not name, 0 not at all.
 *
 * A letter or digit alone needs Ctrl, Cmd and Alt up, and ignores Shift. A named key acts whatever is held with it. A `Mod`
 * key ignores Alt, and takes an extra Shift only as the looser match, so `Mod+Shift+Z` wins over `Mod+Z` when both exist.
 */
export function chordMatch(chord: Chord, press: KeyPress): 0 | 1 | 2 {
  if (press.key.toLowerCase() !== chord.key) return 0;
  const mod = press.ctrlKey || press.metaKey;
  if (chord.mod) {
    if (!mod || (chord.shift && !press.shiftKey)) return 0;
    return chord.shift === press.shiftKey ? 2 : 1;
  }
  if (chord.named) return 2;
  return mod || press.altKey ? 0 : 2;
}

/** The commands a press could mean, in the table's order: the exact matches, or failing any, the looser ones. */
export function commandsForKey<C extends CommandDefinition>(commands: readonly C[], press: KeyPress): C[] {
  let best = 1;
  let found: C[] = [];
  for (const command of commands) {
    if (command.keyOnly === "elsewhere") continue;
    const score = Math.max(0, ...(command.keys ?? []).map((key) => chordMatch(parseChord(key), press)));
    if (score < best) continue;
    if (score > best) found = [];
    best = score;
    found.push(command);
  }
  return found;
}

/** A key as it is shown: `Ctrl+Z`, `B`, `Space`. */
export function keyLabel(key: string, mac = false): string {
  return key.replace("Mod", mac ? "Cmd" : "Ctrl");
}

export function keysLabel(command: CommandDefinition, mac = false): string {
  const keys = (command.keys ?? []).map((key) => keyLabel(key, mac)).join(", ");
  return command.keyOnly === "held" && keys ? `${keys} (held)` : keys;
}

/** The commands whose group, name or key holds every word typed, in the table's order. */
export function searchCommands<C extends CommandDefinition>(commands: readonly C[], query: string): C[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];
  return commands.filter((command) => {
    const text = `${command.group} ${command.name} ${keysLabel(command)}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/**
 * What is wrong with a table, in words; empty when nothing is. One id is one command, every key parses, and a letter, digit
 * or `Mod` key belongs to one command, unless every command on it acts on what is in hand (`onHeld`: copy, paste and
 * duplicate, for a piece and for backstitch). Escape, Enter, Delete and Backspace are shared on purpose: each means "whatever is in
 * hand", only one thing can be in hand at a time, and the first command that takes the press ends it.
 */
export function commandTableProblems(commands: readonly CommandDefinition[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const owners = new Map<string, CommandDefinition>();
  for (const command of commands) {
    if (ids.has(command.id)) problems.push(`Two commands have the id "${command.id}".`);
    ids.add(command.id);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(command.id)) problems.push(`"${command.id}" is not a command id (group.action, lower case).`);
    if (command.name.trim() === "" || command.when.trim() === "") problems.push(`"${command.id}" has no name or no condition.`);
    if (command.keyOnly && !command.keys?.length) problems.push(`"${command.id}" is reached only by a key and names none.`);
    if (command.keyOnly === "elsewhere") continue;
    for (const key of command.keys ?? []) {
      let chord: Chord;
      try {
        chord = parseChord(key);
      } catch (error) {
        problems.push(`${command.id}: ${(error as Error).message}`);
        continue;
      }
      if (chord.named && !chord.mod) continue;
      const canonical = `${chord.mod ? "mod+" : ""}${chord.shift ? "shift+" : ""}${chord.key}`;
      const owner = owners.get(canonical);
      if (owner && !(owner.onHeld && command.onHeld)) problems.push(`"${key}" runs both "${owner.id}" and "${command.id}".`);
      owners.set(canonical, command);
    }
  }
  return problems;
}
