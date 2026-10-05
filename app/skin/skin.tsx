"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { SkinColours, ToolArrangement } from "@/lib/skin/skin";
import { INTERFACE_ICONS, type IconComponent, type IconProps, type InterfaceIconName } from "./icons";

/**
 * A skin (G-095, D295): what the interface looks like, apart from what it does. It may rename no control and remove none;
 * it gives colours, replaces icons, and orders the tools. Anything it leaves out is the default's.
 *
 * Only the default is shipped. Skins are official ones for now (Owner, 2026-10-05): a skin's icons are components, which is
 * why a skin is code and not a file; one made of data alone is a later goal's.
 */
export interface Skin {
  id: string;
  name: string;
  /** The named colours it changes (`lib/skin/skin.ts` lists the names). */
  colours?: SkinColours;
  /** The tools in their groups, by id. */
  tools?: ToolArrangement;
  /** The icons it replaces: an interface icon by its name, a tool's by `tool:<id>`. */
  icons?: Readonly<Partial<Record<InterfaceIconName | `tool:${string}`, IconComponent>>>;
}

/** The interface as it is drawn with nothing changed: the graphite appearance of `app/globals.css`. */
export const ATELIER: Skin = { id: "atelier", name: "Atelier" };

/** The skins a person can be offered. One, until skins are a feature. */
export const OFFICIAL_SKINS: readonly Skin[] = [ATELIER];

const SkinContext = createContext<Skin>(ATELIER);

export function SkinProvider({ skin, children }: { skin: Skin; children?: ReactNode }) {
  return <SkinContext.Provider value={skin}>{children}</SkinContext.Provider>;
}

export function useSkin(): Skin {
  return useContext(SkinContext);
}

/** An icon of the interface, as the skin in force draws it. */
export function SkinIcon({ name, className }: { name: InterfaceIconName } & IconProps) {
  const Icon: IconComponent = useSkin().icons?.[name] ?? INTERFACE_ICONS[name];
  return <Icon className={className} />;
}

/** A tool's icon: the one the tool supplies, unless the skin in force has its own for that tool. */
export function ToolIcon({ id, supplied: Supplied }: { id: string; supplied: ComponentType }) {
  const Replaced = useSkin().icons?.[`tool:${id}`];
  return Replaced ? <Replaced /> : <Supplied />;
}
