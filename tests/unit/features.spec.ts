import { describe, expect, it } from "vitest";
import { assembleCommands, COMMAND_DEFINITIONS, commandDefinition, commandGate, gatedAction } from "../../app/commands/registry";
import { commandFeature, FEATURES, featureById, generationSettingFeature, isFeatureId, toolFeature } from "../../app/features/registry";
import { TOOL_DEFINITIONS } from "../../app/tools/registry";
import { CANVAS_TEXTURES } from "../../lib/export/canvas-texture-catalog";
import { EXPORT_KIND_GROUPS, exportChoiceFeature, exportKindFeature } from "../../lib/export/export-kinds";
import { STITCH_TEXTURES } from "../../lib/export/stitch-texture-catalog";
import {
  EVERYTHING_ON,
  featureShown,
  featureState,
  featureUsable,
  groupFeatures,
  groupState,
  isFeatureIdShape,
  lockedNote,
  withGroupState,
  type FeatureStates,
} from "../../lib/features/features";
import { DEFAULT_OPTIONS } from "../../lib/editor/workspace-storage";
import { optionsInForce } from "../../lib/features/in-force";
import { DITHER_MODES } from "../../lib/pipeline/dither";
import { ditherFeature } from "../../lib/pipeline/dither-labels";
import { GENERATION_SETTINGS } from "../../lib/pipeline/generation-settings";
import { THREAD_BRAND_IDS } from "../../lib/threads/thread-brands";

/** G-102 M1: the feature list is derived from the registries, and a feature's state resolves to on unless set. */

describe("the feature list", () => {
  it("holds every tool that is not core, under the tool's own group", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const id = toolFeature(tool);
      if (id === null) {
        expect(tool.navigation, `${tool.id} is core, which only a navigation tool is`).toBe(true);
        continue;
      }
      expect(isFeatureId(id), id).toBe(true);
    }
    expect(featureById("tool.brush").group).toBe("Drawing tools");
    expect(featureById("tool.select").group).toBe("Selection and transformation");
    expect(toolFeature({ id: "pan", feature: null })).toBeNull();
  });

  it("holds every command that is not core, the shared ones once", () => {
    const mirrors = COMMAND_DEFINITIONS.filter((command) => command.id.startsWith("chart.mirror-"));
    expect(mirrors.length).toBe(4);
    for (const command of mirrors) expect(commandFeature(command)).toBe("chart.mirror");
    expect(FEATURES.filter((feature) => feature.id === "chart.mirror")).toHaveLength(1);
    expect(featureById("chart.symmetry").label).toBe("Symmetry axes");
    expect(featureById("command.colours.isolate").label).toBe("Isolate the lit threads");
    // Undo is core: never in the list.
    expect(commandFeature(COMMAND_DEFINITIONS.find((command) => command.id === "edit.undo")!)).toBeNull();
    // A tool's command is the tool's feature, listed once as the tool.
    expect(commandFeature(COMMAND_DEFINITIONS.find((command) => command.id === "tool.brush")!)).toBe("tool.brush");
    expect(commandFeature(COMMAND_DEFINITIONS.find((command) => command.id === "tool.pan")!)).toBeNull();
    expect(isFeatureId("command.tool.brush")).toBe(false);
  });

  it("holds every export kind, every dither pattern, every texture and every brand", () => {
    for (const { kinds } of EXPORT_KIND_GROUPS)
      for (const kind of kinds) expect(isFeatureId(exportKindFeature(kind)), kind.label).toBe(true);
    expect(isFeatureId("export.all")).toBe(true);
    expect(exportChoiceFeature("a4-bw")).toBe("export.a4");
    expect(exportChoiceFeature("png-realistic")).toBe("export.png-realistic");
    expect(exportChoiceFeature("all")).toBe("export.all");
    for (const mode of DITHER_MODES) {
      const id = ditherFeature(mode);
      if (id !== null) expect(isFeatureId(id), mode).toBe(true);
    }
    expect(featureById("dither.lines").label).toBe("Lines");
    expect(ditherFeature("off")).toBeNull();
    for (const texture of STITCH_TEXTURES) expect(isFeatureId(`texture.stitch.${texture.id}`)).toBe(true);
    for (const texture of CANVAS_TEXTURES) expect(isFeatureId(`texture.canvas.${texture.id}`)).toBe(true);
    for (const brand of THREAD_BRAND_IDS) expect(isFeatureId(`brand.${brand}`)).toBe(true);
  });

  it("holds every generation setting that is a feature, with the sub-settings under their feature", () => {
    for (const setting of GENERATION_SETTINGS) {
      const id = generationSettingFeature(setting);
      if (id !== null) expect(isFeatureId(id), setting.id).toBe(true);
    }
    expect(generationSettingFeature(GENERATION_SETTINGS.find((setting) => setting.id === "textureDensity")!)).toBe(
      "generation.textureStrokes"
    );
    expect(generationSettingFeature(GENERATION_SETTINGS.find((setting) => setting.id === "colorCount")!)).toBeNull();
    expect(featureById("generation.vivid").label).toBe("Vivid colour detail");
  });

  it("has every id in the shape the admin's server actions accept (a camelCase setting was refused, 2026-10-06)", () => {
    for (const feature of FEATURES) expect(isFeatureIdShape(feature.id), feature.id).toBe(true);
    expect(isFeatureIdShape("generation.edgeMode")).toBe(true);
    expect(isFeatureIdShape("Tool.brush")).toBe(false);
    expect(isFeatureIdShape("tool brush")).toBe(false);
    expect(isFeatureIdShape("x".repeat(81))).toBe(false);
  });

  it("has no two features with one id, and every feature has a group and a label", () => {
    expect(new Set(FEATURES.map((feature) => feature.id)).size).toBe(FEATURES.length);
    for (const feature of FEATURES) {
      expect(feature.group.length, feature.id).toBeGreaterThan(0);
      expect(feature.label.length, feature.id).toBeGreaterThan(0);
    }
    expect(() => featureById("tool.nothing")).toThrow(/Unknown feature "tool.nothing"/);
  });

  it("is listed in groups, in the order registered", () => {
    const groups = groupFeatures(FEATURES).map((group) => group.group);
    // The workspaces first, as the widest switches (G-103); Pan and Zoom are core, so there is no Navigation group.
    expect(groups.slice(0, 3)).toEqual(["Workspaces", "Drawing tools", "Selection and transformation"]);
    expect(groups).not.toContain("Navigation");
    expect(groups).toContain("Exports");
    expect(groups).toContain("Thread brands");
  });
});

describe("the workspaces in the list (G-103)", () => {
  it("are three entries in a group of their own, Photo, Edit and Export", () => {
    const group = groupFeatures(FEATURES).find((entry) => entry.group === "Workspaces");
    expect(group?.features.map(({ id, label }) => [id, label])).toEqual([
      ["workspace.photo", "Photo"],
      ["workspace.edit", "Edit"],
      ["workspace.export", "Export"],
    ]);
  });
});

describe("a feature's state", () => {
  const states: FeatureStates = { "tool.text": "locked", "export.a4": "hidden" };

  it("is on unless set, and only on is usable", () => {
    expect(featureState(EVERYTHING_ON, "tool.brush")).toBe("on");
    expect(featureState(states, "tool.text")).toBe("locked");
    expect(featureUsable(states, "tool.text")).toBe(false);
    expect(featureShown(states, "tool.text")).toBe(true);
    expect(featureShown(states, "export.a4")).toBe(false);
    expect(featureUsable(states, "tool.brush")).toBe(true);
  });

  it("names the locked feature in its note", () => {
    expect(lockedNote("Text")).toBe("Text is not available to you.");
  });

  it("gives a group one state when all its features share it, and mixed otherwise", () => {
    const tools = FEATURES.filter((feature) => feature.group === "Drawing tools");
    expect(groupState(EVERYTHING_ON, tools)).toBe("on");
    expect(groupState(states, tools)).toBe("mixed");
    const hidden = withGroupState(states, tools, "hidden");
    expect(groupState(hidden, tools)).toBe("hidden");
    expect(hidden["export.a4"]).toBe("hidden");
    // Back to on is the absence of an entry.
    const on = withGroupState(hidden, tools, "on");
    expect(groupState(on, tools)).toBe("on");
    expect(Object.keys(on)).toEqual(["export.a4"]);
  });
});

describe("the settings in force under the switches", () => {
  it("reads a stored setting that names a feature the person cannot use as its default, and leaves the rest", () => {
    const stored = {
      ...DEFAULT_OPTIONS,
      stitchTexture: "pixel" as const,
      canvasTexture: "natural" as const,
      paletteMode: "dmc" as const,
      ditherMode: "atkinson" as const,
      edgeMode: "crisp" as const,
      vivid: true,
      backstitchLines: true,
      textureStrokes: true,
    };
    expect(optionsInForce(stored, EVERYTHING_ON)).toEqual(stored);
    const inForce = optionsInForce(stored, {
      "texture.stitch.pixel": "hidden",
      "texture.canvas.natural": "locked",
      "brand.dmc": "locked",
      "dither.atkinson": "hidden",
      "generation.vivid": "locked",
    });
    expect(inForce).toMatchObject({
      stitchTexture: "classic",
      canvasTexture: "off",
      paletteMode: "full",
      ditherMode: "off",
      vivid: false,
      // Not touched: their features are on.
      edgeMode: "crisp",
      backstitchLines: true,
      textureStrokes: true,
    });
    // Dithering as a whole off turns every pattern off.
    expect(optionsInForce(stored, { "generation.ditherMode": "hidden" }).ditherMode).toBe("off");
  });
});

describe("the command table under the switches", () => {
  const idle = { available: true, run: () => {} };
  const shell = Object.fromEntries(COMMAND_DEFINITIONS.filter((c) => !c.id.startsWith("tool.")).map((c) => [c.id, idle])) as Parameters<
    typeof assembleCommands
  >[0];

  it("leaves a hidden feature's commands out, and lists a locked one's as unavailable with the note", () => {
    const all = assembleCommands(shell, () => idle, []);
    expect(all.find((c) => c.id === "tool.text")?.available).toBe(true);
    const gated = assembleCommands(shell, () => idle, [], { "tool.text": "hidden", "chart.mirror": "locked", "tool.brush": "locked" });
    expect(gated.find((c) => c.id === "tool.text")).toBeUndefined();
    const mirror = gated.find((c) => c.id === "chart.mirror-left-half")!;
    expect(mirror.available).toBe(false);
    expect(mirror.when).toBe("Mirror the left half is not available to you.");
    expect(gated.find((c) => c.id === "tool.brush")?.available).toBe(false);
    // Core commands are never touched.
    expect(gated.find((c) => c.id === "edit.undo")?.available).toBe(true);
    expect(gated).toHaveLength(all.length - 1);
  });
});

describe("the commands under their workspace's switch (G-103, D313)", () => {
  const idle = { available: true, run: () => {} };
  const shell = Object.fromEntries(COMMAND_DEFINITIONS.filter((c) => !c.id.startsWith("tool.")).map((c) => [c.id, idle])) as Parameters<
    typeof assembleCommands
  >[0];
  const workspaceOf = (id: string) => commandDefinition(id).workspace;

  it("names the workspace whose work each command does", () => {
    for (const id of ["file.choose-photo", "generate.run", "generate.cancel", "generate.reset-adjustment", "view.workspace-photo"])
      expect(workspaceOf(id), id).toBe("photo");
    for (const id of ["file.export", "file.export-all", "file.export-editable", "view.workspace-export"])
      expect(workspaceOf(id), id).toBe("export");
    for (const id of [
      "chart.mirror-left-half",
      "chart.symmetry-vertical",
      "chart.lock-transparency",
      "tool.brush",
      "tool.select",
      "view.workspace-edit",
    ])
      expect(workspaceOf(id), id).toBe("edit");
    // Belonging to none: a new chart, opening a file or pixel art (Owner: these stay with Photo off), Undo, the view.
    for (const id of ["file.new", "file.open", "file.import-pixel-art", "edit.undo", "edit.redo", "view.color", "tool.pan", "tool.zoom"])
      expect(workspaceOf(id), id).toBeUndefined();
  });

  it("lets the workspace win: hidden hides, locked locks with the workspace's name", () => {
    const definition = commandDefinition("chart.mirror-left-half");
    expect(commandGate(definition, EVERYTHING_ON)).toEqual({ state: "on" });
    expect(commandGate(definition, { "workspace.edit": "hidden" })).toEqual({ state: "hidden" });
    expect(commandGate(definition, { "workspace.edit": "locked" })).toEqual({ state: "locked", note: "Edit is not available to you." });
    // Its own switch still counts, and hidden from either side wins over locked from the other.
    expect(commandGate(definition, { "chart.mirror": "locked" })).toEqual({
      state: "locked",
      note: "Mirror the left half is not available to you.",
    });
    expect(commandGate(definition, { "chart.mirror": "hidden", "workspace.edit": "locked" })).toEqual({ state: "hidden" });
    expect(commandGate(definition, { "chart.mirror": "locked", "workspace.edit": "hidden" })).toEqual({ state: "hidden" });
  });

  it("takes a workspace's commands out of the table, keys and all, and leaves the rest", () => {
    const all = assembleCommands(shell, () => idle, []);
    const noPhoto = assembleCommands(shell, () => idle, [], { "workspace.photo": "hidden" });
    for (const id of ["file.choose-photo", "generate.run", "view.workspace-photo"])
      expect(
        noPhoto.find((c) => c.id === id),
        id
      ).toBeUndefined();
    expect(noPhoto.find((c) => c.id === "file.import-pixel-art")?.available).toBe(true);
    expect(noPhoto.find((c) => c.id === "edit.undo")?.available).toBe(true);
    const lockedEdit = assembleCommands(shell, () => idle, [], { "workspace.edit": "locked" });
    expect(lockedEdit).toHaveLength(all.length);
    const brush = lockedEdit.find((c) => c.id === "tool.brush")!;
    expect(brush).toMatchObject({ available: false, when: "Edit is not available to you." });
    expect(lockedEdit.find((c) => c.id === "tool.pan")?.available).toBe(true);
  });

  it("gives a control outside the table the same answer", () => {
    const run = () => {};
    expect(gatedAction("file.export-editable", EVERYTHING_ON, run)).toEqual({ run });
    expect(gatedAction("file.export-editable", { "workspace.export": "hidden" }, run)).toBeNull();
    expect(gatedAction("file.export-editable", { "workspace.export": "locked" }, run)).toMatchObject({
      locked: "Export is not available to you.",
    });
    expect(gatedAction("file.export-editable", { "workspace.export": "locked" }, run)?.run).not.toBe(run);
    expect(() => gatedAction("file.nothing", EVERYTHING_ON, run)).toThrow(/Unknown command "file.nothing"/);
  });
});
