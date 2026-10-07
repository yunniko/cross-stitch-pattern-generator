import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isKeyboardCursorTool, isSelectTool, usesStitchKind } from "../../app/editor-types";
import { DEFAULT_TOOL, moduleIndexOf, TOOL_DEFINITIONS, TOOL_KEYS, TOOL_MODULES, toolDefinition } from "../../app/tools/registry";

/**
 * G-092: the tool registry. A tool exists by being registered; these hold the registry to what the rest of the editor reads
 * from it, and pin the list as it was when the tools were named one by one in seven files.
 */

describe("the registry", () => {
  it("holds the sixteen tools in the order of the tool list", () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.id)).toEqual([
      "brush",
      "fill",
      "line",
      "rect",
      "oval",
      "lasso-fill",
      "picker",
      "text",
      "backstitch",
      "backstitch-edit",
      "select",
      "lasso",
      "crop",
      "move",
      "pan",
      "zoom",
    ]);
    expect(TOOL_DEFINITIONS.map((tool) => tool.group)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2]);
    expect(DEFAULT_TOOL).toBe("brush");
  });

  it("gives every tool an id, a label and a title of its own", () => {
    const ids = TOOL_DEFINITIONS.map((tool) => tool.id);
    const labels = TOOL_DEFINITIONS.map((tool) => tool.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.label.trim(), tool.id).not.toBe("");
      expect(tool.title.trim(), tool.id).not.toBe("");
      expect(typeof tool.Icon, tool.id).toBe("function");
    }
  });

  it("has no two tools on one key, no key the editor already uses, and names its key in its title", () => {
    const keyed = TOOL_DEFINITIONS.filter((tool) => tool.key);
    expect(TOOL_KEYS.size).toBe(keyed.length);
    expect(Object.fromEntries(TOOL_KEYS)).toEqual({
      b: "brush",
      f: "fill",
      l: "line",
      r: "rect",
      o: "oval",
      g: "lasso-fill",
      i: "picker",
      k: "backstitch",
      j: "backstitch-edit",
      s: "select",
      q: "lasso",
      c: "crop",
      v: "move",
      h: "pan",
      z: "zoom",
    });
    for (const tool of keyed) {
      expect(tool.key, tool.id).toMatch(/^[a-z]$/);
      // x swaps the colours. Z is Zoom alone and undo with Ctrl: a plain letter never matches a press with Ctrl down.
      expect(tool.key, tool.id).not.toBe("x");
      expect(tool.title, tool.id).toContain(`(${tool.key!.toUpperCase()})`);
    }
  });

  it("fails by name for a tool it does not hold", () => {
    expect(() => toolDefinition("highlight")).toThrow('Unknown tool "highlight": it is not in the tool registry.');
    expect(() => moduleIndexOf("highlight")).toThrow(/not in the tool registry/);
  });

  it("finds the module that owns each tool", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const owner = TOOL_MODULES[moduleIndexOf(tool.id)];
      expect(
        owner.definitions.some((definition) => definition.id === tool.id),
        tool.id
      ).toBe(true);
    }
  });
});

describe("what the editor reads from a tool's definition", () => {
  const ids = (predicate: (tool: (typeof TOOL_DEFINITIONS)[number]["id"]) => boolean) =>
    TOOL_DEFINITIONS.filter((tool) => predicate(tool.id)).map((tool) => tool.id);

  it("is what it was when each was a list of names", () => {
    expect(ids(usesStitchKind)).toEqual(["brush", "fill", "line", "rect", "oval", "lasso-fill"]);
    expect(ids(isKeyboardCursorTool)).toEqual(["brush", "fill", "line", "rect", "oval"]);
    expect(ids(isSelectTool)).toEqual(["select", "lasso"]);
    expect(TOOL_DEFINITIONS.filter((tool) => tool.navigation).map((tool) => tool.id)).toEqual(["pan", "zoom"]);
    // G-104, D318: Alt borrows the picker from the tools that paint with the colour in hand; Zoom keeps its own Alt.
    expect(TOOL_DEFINITIONS.filter((tool) => tool.heldPicker).map((tool) => tool.id)).toEqual([
      "brush",
      "fill",
      "line",
      "rect",
      "oval",
      "lasso-fill",
    ]);
    expect(Object.fromEntries(TOOL_DEFINITIONS.filter((tool) => tool.outline).map((tool) => [tool.id, tool.outline]))).toEqual({
      brush: "brush",
      line: "brush",
      fill: "one",
      "lasso-fill": "one",
      rect: "press",
      oval: "press",
    });
    expect(Object.fromEntries(TOOL_DEFINITIONS.filter((tool) => tool.cursor).map((tool) => [tool.id, tool.cursor]))).toEqual({
      fill: "cross",
      picker: "pick",
      text: "cross",
      select: "cross",
      lasso: "cross",
      pan: "grab",
      zoom: "zoom",
    });
  });
});

describe("the boundary a tool module keeps (D284)", () => {
  const dir = path.join(__dirname, "..", "..", "app", "tools");
  const shell = new Set(["registry.ts", "use-tools.ts", "types.ts", "shared.ts", "icons.tsx", "options.tsx"]);
  const modules = readdirSync(dir).filter((file) => !shell.has(file));

  it("imports no other tool, not the registry, and not the workspace", () => {
    const names = modules.map((file) => file.replace(/\.tsx?$/, ""));
    for (const file of modules) {
      const source = readFileSync(path.join(dir, file), "utf8");
      const imported = [...source.matchAll(/from "(\.[^"]*)"/g)].map((m) => m[1]);
      for (const from of imported) {
        expect(from, `${file} imports ${from}`).not.toMatch(/workspace|\/registry$|\/use-tools$/);
        if (from.startsWith("./")) expect(names, `${file} imports the tool ${from}`).not.toContain(from.slice(2));
      }
    }
  });

  it("every module file is registered", () => {
    const registry = readFileSync(path.join(dir, "registry.ts"), "utf8");
    for (const file of modules) expect(registry, file).toContain(`from "./${file.replace(/\.tsx?$/, "")}"`);
  });
});

describe("the options each tool declares (G-093)", () => {
  const optionIds = (id: string) => (toolDefinition(id).options ?? []).map((option) => option.id);

  it("are its own: the brush's size and shape only where the tool draws with the brush (D288)", () => {
    const shown = Object.fromEntries(TOOL_DEFINITIONS.map((tool) => [tool.id, optionIds(tool.id).join(" ")]));
    expect(shown).toEqual({
      brush: "brushSize brushShape stitchKind",
      fill: "stitchKind fillDiagonal fillColorOnly",
      line: "brushSize brushShape stitchKind",
      rect: "brushSize brushShape stitchKind shapeFill",
      oval: "brushSize brushShape stitchKind shapeFill",
      "lasso-fill": "stitchKind",
      picker: "",
      text: "",
      backstitch: "",
      "backstitch-edit": "",
      select: "selectionMode",
      lasso: "selectionMode",
      crop: "",
      move: "",
      pan: "",
      zoom: "zoomDirection",
    });
  });

  it("offer the stitch type exactly where the tool lays stitches", () => {
    for (const tool of TOOL_DEFINITIONS) expect(optionIds(tool.id).includes("stitchKind"), tool.id).toBe(tool.laysStitches === true);
  });

  it("are well formed: a default among the values, a way to show every value, one id one option", () => {
    const byId = new Map<string, unknown>();
    for (const tool of TOOL_DEFINITIONS) {
      for (const option of tool.options ?? []) {
        expect(option.values, option.id).toContain(option.defaultValue);
        expect(option.values.length, option.id).toBeGreaterThan(1);
        for (const choice of option.choices ?? []) expect(option.values, option.id).toContain(choice.value);
        if (option.control !== "select") expect(option.choices?.length, option.id).toBe(option.values.length);
        if (byId.has(option.id)) expect(byId.get(option.id), option.id).toBe(option);
        byId.set(option.id, option);
      }
    }
  });
});
