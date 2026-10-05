import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ToolRail } from "../../app/components/tool-rail";
import { INTERFACE_ICONS } from "../../app/skin/icons";
import { ATELIER, OFFICIAL_SKINS, SkinIcon, SkinProvider, type Skin } from "../../app/skin/skin";
import { TOOL_DEFINITIONS } from "../../app/tools/registry";
import { arrangeTools, SKIN_COLOURS, skinColourProblems, skinStyle } from "../../lib/skin/skin";
import { PAPER } from "./fixtures/paper-skin";

/**
 * G-095, D295: what makes the interface skinnable. The fixture skin `PAPER` is not shipped: it exists to show that a skin
 * made of nothing but colours, an order of tools and replaced icons changes what is drawn, with no component edited.
 */

const css = readFileSync(path.join(__dirname, "..", "..", "app", "globals.css"), "utf8");

describe("the named colours", () => {
  it("are exactly the values the stylesheet declares", () => {
    const root = css.slice(css.indexOf(":root {"), css.indexOf("@theme inline"));
    const declared = [...root.matchAll(/^\s*--at-([a-z-]+):/gm)].map((match) => match[1]);
    expect([...declared].sort()).toEqual([...SKIN_COLOURS].sort());
  });

  it("are each offered to the components as a class", () => {
    for (const name of SKIN_COLOURS) expect(css, name).toContain(`var(--at-${name})`);
  });

  it("become custom properties, and only the ones a skin names", () => {
    expect(skinStyle(undefined)).toEqual({});
    expect(skinStyle({ surface: "#ffffff", ink: " #111111 " })).toEqual({ "--at-surface": "#ffffff", "--at-ink": "#111111" });
  });

  it("refuse a name the interface does not have, and a value that is not a colour", () => {
    expect(skinColourProblems({ surfaec: "#fff" })).toEqual(['"surfaec" is not a colour the interface has.']);
    expect(skinColourProblems({ surface: "red; background: url(x)" })).toEqual(['"surface" is not given a colour.']);
    expect(skinColourProblems({ surface: 3 })).toEqual(['"surface" is not given a colour.']);
    expect(() => skinStyle({ surface: "} body {" })).toThrow(/cannot be used/);
    expect(skinColourProblems(PAPER.colours ?? {})).toEqual([]);
  });
});

describe("the arrangement of the tools", () => {
  const tools = [
    { id: "a", group: 0 },
    { id: "b", group: 0 },
    { id: "c", group: 1 },
    { id: "d", group: 2 },
  ];

  it("is each tool's own group, in the registered order, when the skin gives none", () => {
    expect(arrangeTools(tools)).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("is the skin's, where it gives one", () => {
    expect(
      arrangeTools(tools, [
        ["d", "c"],
        ["b", "a"],
      ])
    ).toEqual([
      ["d", "c"],
      ["b", "a"],
    ]);
  });

  it("never loses a tool the skin does not place, and never shows one twice or one that is not a tool", () => {
    // "b" is not placed: it joins the skin's group of its own number. "d" has no such group: it comes last.
    expect(arrangeTools(tools, [["a", "a", "nothing"], ["c"]])).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(arrangeTools(tools, [[], ["a"]])).toEqual([["b"], ["a", "c"], ["d"]]);
  });

  it("holds every registered tool once, under the shipped skin and the fixture", () => {
    for (const skin of [ATELIER, PAPER]) {
      const placed = arrangeTools(TOOL_DEFINITIONS, skin.tools).flat();
      expect([...placed].sort(), skin.id).toEqual(TOOL_DEFINITIONS.map((tool) => tool.id).sort());
    }
  });
});

describe("a skin, drawn", () => {
  const rail = (skin: Skin) =>
    renderToStaticMarkup(
      createElement(
        SkinProvider,
        { skin },
        createElement(ToolRail, {
          workspace: "edit",
          activeTool: "brush",
          disabled: false,
          onSelect: () => {},
          squareCanvas: true,
          onMirror: () => {},
        })
      )
    );
  const toolLabels = (markup: string) => [...markup.matchAll(/aria-label="([^"]+)" aria-pressed/g)].map((match) => match[1]);

  it("ships one skin, which changes nothing", () => {
    expect(OFFICIAL_SKINS).toEqual([ATELIER]);
    expect(ATELIER.colours).toBeUndefined();
    expect(toolLabels(rail(ATELIER))).toEqual(TOOL_DEFINITIONS.map((tool) => tool.label));
  });

  it("orders the tools as the skin says, with no component edited", () => {
    const labels = toolLabels(rail(PAPER));
    expect(labels.slice(0, 2)).toEqual(["Pan", "Zoom"]);
    expect([...labels].sort()).toEqual(TOOL_DEFINITIONS.map((tool) => tool.label).sort());
  });

  it("draws the skin's icon for a tool and for the interface, and the supplied one otherwise", () => {
    const paper = rail(PAPER);
    expect(paper).toContain('data-paper-icon="tool:brush"');
    expect(paper).toContain('data-paper-icon="mirror-left-half"');
    expect(rail(ATELIER)).not.toContain("data-paper-icon");
    // A tool the skin has no icon for keeps the one it supplies.
    expect((paper.match(/<svg/g) ?? []).length).toBe((rail(ATELIER).match(/<svg/g) ?? []).length);
  });

  it("has an icon for every name the set offers", () => {
    for (const name of Object.keys(INTERFACE_ICONS) as (keyof typeof INTERFACE_ICONS)[]) {
      expect(renderToStaticMarkup(createElement(SkinIcon, { name })), name).toContain("<svg");
    }
  });
});
