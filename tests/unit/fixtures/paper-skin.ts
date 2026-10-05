import { createElement } from "react";
import type { Skin } from "../../../app/skin/skin";

/**
 * A second skin, for the tests only (G-095, D295): light where the shipped one is dark, the ways of moving about listed
 * first, and two icons of its own. It is not offered to anyone; it proves a skin is data plus icons and nothing else.
 */
const marked = (name: string) =>
  function PaperIcon() {
    return createElement(
      "svg",
      { viewBox: "0 0 24 24", "data-paper-icon": name, "aria-hidden": true },
      createElement("circle", { cx: 12, cy: 12, r: 8 })
    );
  };

export const PAPER: Skin = {
  id: "paper",
  name: "Paper",
  colours: {
    well: "#d9d6cf",
    app: "#efece6",
    surface: "#faf8f4",
    raised: "#ece8e0",
    sunken: "#ffffff",
    line: "#cfc9bd",
    ink: "#22201c",
    muted: "#5d584f",
    faint: "#8a8478",
    accent: "#0f766e",
    "on-accent": "#ffffff",
    shadow: "rgb(60 50 30)",
  },
  tools: [["pan", "zoom"]],
  icons: { "tool:brush": marked("tool:brush"), "mirror-left-half": marked("mirror-left-half") },
};
