"use server";

import { revalidatePath } from "next/cache";
import type { FeatureSwitch } from "@/generated/prisma/client";
import { adminAction, type Admin } from "@/lib/admin/admin-action";
import { logChange } from "@/lib/admin/change-log-data";
import { isFeatureIdShape, isFeatureState, type FeatureState } from "@/lib/features/features";
import { prisma } from "@/lib/prisma";

/**
 * The admin's feature switches (G-102 M3): the site's states, a person's, a set's entries, and which set a tier points
 * at. Each action checks the caller is an admin itself and writes a line to `FeatureChange` saying who changed what.
 *
 * A feature id is taken as the client sends it, checked for shape only: the feature list lives with the tools' client
 * modules, which a server module cannot import. A row naming a feature that no longer exists is ignored by the resolver.
 */

const NAME = /^[^\s][^\n]{0,59}$/;

const SWITCH: Record<FeatureState, FeatureSwitch> = { on: "ON", locked: "LOCKED", hidden: "HIDDEN" };

/** What an action answers: a refusal as `error` (see `admin-action.ts`), or the id of what it made. */
export type ActionResult = { error?: string; id?: string };

function attempt(work: (admin: Admin) => Promise<string | void>): Promise<ActionResult> {
  return adminAction(
    async (admin): Promise<ActionResult> => {
      const id = await work(admin);
      return id ? { id } : {};
    },
    { explain: (error) => ((error as { code?: string }).code === "P2002" ? "That name is taken." : undefined) }
  );
}

/** A state to set, or "site" for a person or a set to follow the site (no row). */
export type StateChoice = FeatureState | "site";

function checkedEntries(entries: unknown): Array<{ featureId: string; state: StateChoice }> {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 200) throw new Error("Nothing to change.");
  return entries.map((entry) => {
    const { featureId, state } = entry as { featureId?: unknown; state?: unknown };
    if (!isFeatureIdShape(featureId)) throw new Error("That is not a feature id.");
    if (state !== "site" && !isFeatureState(state)) throw new Error("That is not a state.");
    return { featureId, state };
  });
}

/** The site's states: "on" removes the row, since a feature with no row is on. */
export async function setSiteFeaturesAction(entries: Array<{ featureId: string; state: StateChoice }>): Promise<ActionResult> {
  return attempt(async (admin) => {
    for (const { featureId, state } of checkedEntries(entries)) {
      if (state === "on" || state === "site") await prisma.featureState.deleteMany({ where: { featureId } });
      else
        await prisma.featureState.upsert({
          where: { featureId },
          create: { featureId, state: SWITCH[state], updatedBy: admin.email },
          update: { state: SWITCH[state], updatedBy: admin.email },
        });
      await logChange(admin, "SITE", "", `${featureId} → ${state === "site" ? "on" : state}`);
    }
    revalidatePath("/admin/features");
    revalidatePath("/admin/changes");
    revalidatePath("/");
  });
}

/** A person's own states: "site" removes the row; "on" is kept as a row, since it lifts a lock the site or the tier has. */
export async function setUserFeaturesAction(
  userId: string,
  entries: Array<{ featureId: string; state: StateChoice }>
): Promise<ActionResult> {
  return attempt(async (admin) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new Error("No such account.");
    for (const { featureId, state } of checkedEntries(entries)) {
      if (state === "site") await prisma.userFeature.deleteMany({ where: { userId, featureId } });
      else
        await prisma.userFeature.upsert({
          where: { userId_featureId: { userId, featureId } },
          create: { userId, featureId, state: SWITCH[state], updatedBy: admin.email },
          update: { state: SWITCH[state], updatedBy: admin.email },
        });
      await logChange(admin, "USER", userId, `${user.email}: ${featureId} → ${state === "site" ? "as the site" : state}`);
    }
    revalidatePath(`/admin/users/${userId}/features`);
    revalidatePath("/");
  });
}

/** Makes a set and returns its id, so the page can show it at once. */
export async function createFeatureSetAction(name: string): Promise<ActionResult> {
  return attempt(async (admin) => {
    const trimmed = name.trim();
    if (!NAME.test(trimmed)) throw new Error("A set needs a name of up to 60 characters.");
    const set = await prisma.featureSet.create({ data: { name: trimmed } });
    await logChange(admin, "SET", set.id, `set "${trimmed}" made`);
    revalidatePath("/admin/features");
    revalidatePath("/admin/changes");
    return set.id;
  });
}

export async function deleteFeatureSetAction(setId: string): Promise<ActionResult> {
  return attempt(async (admin) => {
    const set = await prisma.featureSet.findUnique({
      where: { id: setId },
      select: { name: true, tiers: { select: { id: true } }, audiences: { select: { audience: true } } },
    });
    if (!set) throw new Error("No such set.");
    if (set.tiers.length > 0) throw new Error("A tier points at this set; detach it first.");
    if (set.audiences.length > 0) throw new Error("Guests or accounts are given this set; choose another for them first.");
    await prisma.featureSet.delete({ where: { id: setId } });
    await logChange(admin, "SET", setId, `set "${set.name}" deleted`);
    revalidatePath("/admin/features");
    revalidatePath("/admin/changes");
  });
}

/** A set's entries: "site" removes the entry; the other three are kept, "on" included. */
export async function setFeatureSetEntriesAction(
  setId: string,
  entries: Array<{ featureId: string; state: StateChoice }>
): Promise<ActionResult> {
  return attempt(async (admin) => {
    const set = await prisma.featureSet.findUnique({ where: { id: setId }, select: { name: true } });
    if (!set) throw new Error("No such set.");
    for (const { featureId, state } of checkedEntries(entries)) {
      if (state === "site") await prisma.featureSetEntry.deleteMany({ where: { setId, featureId } });
      else
        await prisma.featureSetEntry.upsert({
          where: { setId_featureId: { setId, featureId } },
          create: { setId, featureId, state: SWITCH[state] },
          update: { state: SWITCH[state] },
        });
      await logChange(admin, "SET", setId, `set "${set.name}": ${featureId} → ${state === "site" ? "as the site" : state}`);
    }
    revalidatePath("/admin/features");
    revalidatePath("/admin/changes");
    revalidatePath("/");
  });
}

export async function createTierAction(name: string): Promise<ActionResult> {
  return attempt(async (admin) => {
    const trimmed = name.trim();
    if (!NAME.test(trimmed)) throw new Error("A tier needs a name of up to 60 characters.");
    const tier = await prisma.tier.create({ data: { name: trimmed } });
    await logChange(admin, "TIER", tier.id, `tier "${trimmed}" made`);
    revalidatePath("/admin/features");
    revalidatePath("/admin/billing");
    revalidatePath("/admin/changes");
  });
}

/** Which set a tier gives its people; null for none. */
export async function attachSetToTierAction(tierId: string, setId: string | null): Promise<ActionResult> {
  return attempt(async (admin) => {
    const tier = await prisma.tier.findUnique({ where: { id: tierId }, select: { name: true } });
    if (!tier) throw new Error("No such tier.");
    const set = setId ? await prisma.featureSet.findUnique({ where: { id: setId }, select: { name: true } }) : null;
    if (setId && !set) throw new Error("No such set.");
    await prisma.tier.update({ where: { id: tierId }, data: { featureSetId: setId } });
    await logChange(admin, "TIER", tierId, `tier "${tier.name}" → ${set ? `set "${set.name}"` : "no set"}`);
    revalidatePath("/admin/features");
    revalidatePath("/admin/changes");
    revalidatePath("/");
  });
}

/** The set every guest ("guests") or every signed-in account ("accounts") gets; null for none (D307). */
export async function setAudienceSetAction(audience: string, setId: string | null): Promise<ActionResult> {
  return attempt(async (admin) => {
    if (audience !== "guests" && audience !== "accounts") throw new Error("That is not an audience.");
    const set = setId ? await prisma.featureSet.findUnique({ where: { id: setId }, select: { name: true } }) : null;
    if (setId && !set) throw new Error("No such set.");
    if (setId)
      await prisma.audienceSet.upsert({ where: { audience }, create: { audience, featureSetId: setId }, update: { featureSetId: setId } });
    else await prisma.audienceSet.deleteMany({ where: { audience } });
    await logChange(admin, "AUDIENCE", audience, `${audience} → ${set ? `set "${set.name}"` : "no set"}`);
    revalidatePath("/admin/features");
    revalidatePath("/admin/changes");
    revalidatePath("/");
  });
}
