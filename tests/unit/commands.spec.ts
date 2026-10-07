import { describe, expect, it } from "vitest";
import { COMMAND_DEFINITIONS, assembleCommands, toolCommandId } from "../../app/commands/registry";
import { TOOL_DEFINITIONS } from "../../app/tools/registry";
import {
  COMMAND_GROUPS,
  chordMatch,
  commandTableProblems,
  commandsForKey,
  keysLabel,
  parseChord,
  searchCommands,
  type CommandDefinition,
  type KeyPress,
} from "../../lib/editor/commands";

/** G-093: the command table, and how a key press finds its command in it. */

const press = (key: string, held: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...held,
});
const idsFor = (key: string, held: Partial<KeyPress> = {}) => commandsForKey(COMMAND_DEFINITIONS, press(key, held)).map((c) => c.id);

describe("the command table", () => {
  it("has nothing wrong with it: one id one command, every key a real key, no letter or digit claimed twice", () => {
    expect(commandTableProblems(COMMAND_DEFINITIONS)).toEqual([]);
  });

  it("is pinned: every command, in order, with its keys", () => {
    expect(COMMAND_DEFINITIONS.map((c) => `${c.id}${c.keys ? ` [${keysLabel(c)}]` : ""}`)).toEqual([
      "file.new",
      "file.choose-photo",
      "file.open",
      "file.import-pixel-art",
      "file.export",
      "file.export-all",
      "file.export-editable",
      "generate.run",
      "generate.cancel",
      "generate.reset-adjustment",
      "edit.undo [Ctrl+Z]",
      "edit.redo [Ctrl+Y, Ctrl+Shift+Z]",
      "edit.cancel-shape [Escape]",
      "edit.cancel-lasso-fill [Escape]",
      "tools.pick-held [Alt (held)]",
      "tool.brush [B]",
      "tool.fill [F]",
      "tool.line [L]",
      "tool.rect [R]",
      "tool.oval [O]",
      "tool.lasso-fill [G]",
      "tool.picker [I]",
      "tool.text",
      "tool.backstitch [K]",
      "tool.backstitch-edit [J]",
      "tool.select [S]",
      "tool.lasso [Q]",
      "tool.crop [C]",
      "tool.move [V]",
      "tool.pan [H]",
      "tool.zoom [Z]",
      "selection.invert",
      "selection.copy [Ctrl+C]",
      "selection.paste [Ctrl+V]",
      "selection.duplicate [Ctrl+D]",
      "selection.fill",
      "selection.flip-horizontal",
      "selection.flip-vertical",
      "selection.rotate-right",
      "selection.rotate-left",
      "selection.crop",
      "selection.apply [Enter]",
      "selection.cancel [Escape]",
      "backstitch.end-run [Escape]",
      "backstitch.copy [Ctrl+C]",
      "backstitch.paste [Ctrl+V]",
      "backstitch.duplicate [Ctrl+D]",
      "backstitch.mirror-horizontal",
      "backstitch.mirror-vertical",
      "backstitch.turn-right",
      "backstitch.turn-left",
      "backstitch.recolour",
      "backstitch.delete [Delete, Backspace]",
      "backstitch.deselect [Escape]",
      "crop.apply [Enter]",
      "crop.reset [Escape]",
      "colours.swap [X]",
      "colours.isolate",
      "chart.mirror-left-half",
      "chart.mirror-upper-half",
      "chart.mirror-upper-left-corner",
      "chart.mirror-upper-left-half-corner",
      "chart.symmetry-vertical",
      "chart.symmetry-horizontal",
      "chart.symmetry-diagonal",
      "chart.symmetry-antidiagonal",
      "chart.lock-transparency",
      "view.color [1]",
      "view.bw [2]",
      "view.realistic [3]",
      "view.symbols [Y]",
      "view.photo [P]",
      "view.photo-half [4]",
      "view.photo-only [5]",
      "view.workspace-photo",
      "view.workspace-edit",
      "view.workspace-export",
      "view.zoom-in",
      "view.zoom-out",
      "view.zoom-reset",
      "view.command-list [Ctrl+K]",
      "view.preferences",
      "view.whats-new",
      "view.pan-held [Space (held)]",
      "cursor.move [Arrow keys]",
      "cursor.move-ten [Shift+Arrow keys]",
      "cursor.pen [Enter]",
    ]);
  });

  it("lists its groups in the order they are shown, and uses no group it does not list", () => {
    const order = COMMAND_DEFINITIONS.map((c) => COMMAND_GROUPS.indexOf(c.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order).not.toContain(-1);
  });

  it("has one command per registered tool, on the tool's own key", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const command = COMMAND_DEFINITIONS.find((c) => c.id === toolCommandId(tool.id));
      expect(command, tool.id).toBeDefined();
      expect(command!.keys, tool.id).toEqual(tool.key ? [tool.key.toUpperCase()] : undefined);
    }
  });
});

describe("a key press", () => {
  it("finds the keys the editor had before the table, each on the command it ran", () => {
    expect(idsFor("b")).toEqual(["tool.brush"]);
    expect(idsFor("B", { shiftKey: true })).toEqual(["tool.brush"]);
    expect(idsFor("q")).toEqual(["tool.lasso"]);
    expect(idsFor("x")).toEqual(["colours.swap"]);
    expect(idsFor("3")).toEqual(["view.realistic"]);
    expect(idsFor("z", { ctrlKey: true })).toEqual(["edit.undo"]);
    expect(idsFor("z", { metaKey: true })).toEqual(["edit.undo"]);
    expect(idsFor("y", { ctrlKey: true })).toEqual(["edit.redo"]);
    expect(idsFor(" ")).toEqual(["view.pan-held"]);
    expect(idsFor("Delete")).toEqual(["backstitch.delete"]);
    expect(idsFor("Backspace")).toEqual(["backstitch.delete"]);
  });

  it("with Shift takes the key that names Shift over the one that does not", () => {
    expect(idsFor("Z", { ctrlKey: true, shiftKey: true })).toEqual(["edit.redo"]);
    // No key names Ctrl+Shift+Y, so the looser match stands, as it did.
    expect(idsFor("Y", { ctrlKey: true, shiftKey: true })).toEqual(["edit.redo"]);
  });

  it("offers Escape and Enter to every command that shares them, in the order they are tried", () => {
    expect(idsFor("Escape")).toEqual([
      "edit.cancel-shape",
      "edit.cancel-lasso-fill",
      "selection.cancel",
      "backstitch.end-run",
      "backstitch.deselect",
      "crop.reset",
    ]);
    // The keyboard cursor's Enter is listened to elsewhere, so the table does not hand it out.
    expect(idsFor("Enter")).toEqual(["selection.apply", "crop.apply"]);
  });

  it("is nobody's with Ctrl, Cmd or Alt down on a plain letter or digit, or on a key no command has", () => {
    expect(idsFor("b", { ctrlKey: true })).toEqual([]);
    expect(idsFor("b", { altKey: true })).toEqual([]);
    expect(idsFor("1", { metaKey: true })).toEqual([]);
    expect(idsFor("a")).toEqual([]);
    // Z alone is Zoom; with Ctrl it is undo and never the tool.
    expect(idsFor("z")).toEqual(["tool.zoom"]);
    expect(idsFor("!", { shiftKey: true })).toEqual([]);
    expect(idsFor("ArrowLeft")).toEqual([]);
  });

  it("matches a named key whatever is held with it", () => {
    expect(chordMatch(parseChord("Escape"), press("Escape", { ctrlKey: true, shiftKey: true }))).toBe(2);
    expect(chordMatch(parseChord("Space"), press(" ", { ctrlKey: true }))).toBe(2);
  });

  it("refuses a key the table cannot mean, by name", () => {
    expect(() => parseChord("Ctrl+Z")).toThrow('"Ctrl+Z" is not a key a command can have.');
    expect(() => parseChord("F5")).toThrow(/not a key/);
  });

  it("takes Alt held on its own, and Alt written with anything else as no key (G-104)", () => {
    expect(parseChord("Alt")).toEqual({ mod: false, shift: false, key: "alt", named: true, modifier: true });
    expect(chordMatch(parseChord("Alt"), press("Alt", { altKey: true }))).toBe(2);
    expect(chordMatch(parseChord("Alt"), press("Alt", { altKey: true, shiftKey: true })), "whatever else is down").toBe(2);
    expect(chordMatch(parseChord("Alt"), press("AltGraph", { altKey: true, ctrlKey: true })), "AltGr is for typing").toBe(0);
    expect(chordMatch(parseChord("Alt"), press("a", { altKey: true }))).toBe(0);
    expect(() => parseChord("Mod+Alt")).toThrow('"Mod+Alt" is not a key a command can have.');
    expect(() => parseChord("Alt+P")).toThrow(/not a key/);
  });

  it("shows Alt as Option on a Mac, and a held key as held", () => {
    const held: CommandDefinition = { id: "tools.pick-held", name: "Pick", group: "Tools", when: "Always", keys: ["Alt"], keyOnly: "held" };
    expect(keysLabel(held)).toBe("Alt (held)");
    expect(keysLabel(held, true)).toBe("Option (held)");
  });
});

describe("what the table check catches", () => {
  const base: CommandDefinition = { id: "edit.one", name: "One", group: "Edit", when: "Always" };

  it("names each mistake", () => {
    expect(commandTableProblems([base, { ...base }])).toEqual(['Two commands have the id "edit.one".']);
    expect(
      commandTableProblems([
        { ...base, keys: ["B"] },
        { ...base, id: "edit.two", keys: ["B"] },
      ])
    ).toEqual(['"B" runs both "edit.one" and "edit.two".']);
    expect(commandTableProblems([{ ...base, id: "One" }])).toEqual(['"One" is not a command id (group.action, lower case).']);
    expect(commandTableProblems([{ ...base, keys: ["Ctrl+B"] }])).toEqual(['edit.one: "Ctrl+B" is not a key a command can have.']);
    expect(commandTableProblems([{ ...base, keyOnly: "gesture" }])).toEqual(['"edit.one" is reached only by a key and names none.']);
  });

  it("lets a Ctrl key be shared only by commands that all act on what is in hand", () => {
    const copy = { ...base, keys: ["Mod+C"], onHeld: true };
    expect(commandTableProblems([copy, { ...copy, id: "edit.two" }])).toEqual([]);
    expect(commandTableProblems([copy, { ...base, id: "edit.two", keys: ["Mod+C"] }])).toEqual([
      '"Mod+C" runs both "edit.one" and "edit.two".',
    ]);
    expect(idsFor("c", { ctrlKey: true })).toEqual(["selection.copy", "backstitch.copy"]);
    expect(idsFor("k", { metaKey: true })).toEqual(["view.command-list"]);
  });

  it("lets a modifier held alone belong to one command only, as a letter does", () => {
    expect(
      commandTableProblems([
        { ...base, keys: ["Alt"], keyOnly: "held" },
        { ...base, id: "edit.two", keys: ["Alt"], keyOnly: "held" },
      ])
    ).toEqual(['"Alt" runs both "edit.one" and "edit.two".']);
  });

  it("lets Escape and Enter be shared", () => {
    expect(
      commandTableProblems([
        { ...base, keys: ["Escape"] },
        { ...base, id: "edit.two", keys: ["Escape"] },
      ])
    ).toEqual([]);
  });
});

describe("searching the list", () => {
  it("finds by name, by group and by key, every word having to be there", () => {
    expect(searchCommands(COMMAND_DEFINITIONS, "undo").map((c) => c.id)).toEqual(["edit.undo"]);
    expect(searchCommands(COMMAND_DEFINITIONS, "ctrl+z").map((c) => c.id)).toEqual(["edit.undo"]);
    expect(searchCommands(COMMAND_DEFINITIONS, "selection flip").map((c) => c.id)).toEqual([
      "selection.flip-horizontal",
      "selection.flip-vertical",
    ]);
    expect(searchCommands(COMMAND_DEFINITIONS, "  ")).toHaveLength(COMMAND_DEFINITIONS.length);
    expect(searchCommands(COMMAND_DEFINITIONS, "no such thing")).toEqual([]);
  });
});

describe("the table with what each command does", () => {
  const idle = { available: false, run: () => {} };

  it("fails by name for a command with nothing behind it", () => {
    const shell = Object.fromEntries(
      COMMAND_DEFINITIONS.filter((c) => !c.id.startsWith("tool.")).map((c) => [c.id, idle])
    ) as unknown as Parameters<typeof assembleCommands>[0];
    // Everything supplied: the tools' own commands arrive through `shell` here only because the test hands them in that way.
    expect(assembleCommands(shell, () => idle, [])).toHaveLength(COMMAND_DEFINITIONS.length);
    const rest = Object.fromEntries(Object.entries(shell).filter(([id]) => id !== "edit.undo"));
    expect(() => assembleCommands(rest as typeof shell, () => idle, [])).toThrow(
      'The command "edit.undo" is registered with nothing to run.'
    );
  });
});
