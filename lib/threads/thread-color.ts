import type { RGB } from "../types";

/** A buyable thread color. `name` is "" for a brand with no published names (Cosmo, Anchor). */
export interface ThreadColor {
  code: string;
  name: string;
  rgb: RGB;
}
