"use server";

import { revalidatePath } from "next/cache";
import type { FeatureSwitch } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { isFeatureState, type FeatureState } from "@/lib/features/features";
import { prisma } from "@/lib/prisma";

/**
 * The admin's feature switches (G-102 M3): the site's states, a person's, a set's entries, and which set a tier points
 * at. Each action checks the caller is an admin itself and writes a line to `FeatureChange` saying who changed what.
 *
 * A feature id is taken as the client sends it, checked for shape only: the feature list lives with the tools' client
 * modules, which a server module cannot import. A row naming a feature that no longer exists is ignored by the resolver.
 */

const FEATURE_ID = /^[a-z0-9][a-z0-9.-]{0,79}$/;
const NAME = /^[^\s][^\n]{0,59}$/;

const SWITCH: Record<FeatureState, FeatureSwitch> = { on: "ON", locked: "LOCKED", hidden: "HIDDEN" };

async function requireAdmin(): Promise<{ id: string; email: string }> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("Admin access required.");
  return { id: session.user.id, email: session.user.email ?? "" };
}

/** A state to set, or "site" for a person or a set to follow the site (no row). */
export type StateChoice = FeatureState | "site";

function checkedEntries(entries: unknown): Array<{ featureId: string; state: StateChoice }> {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 200) throw new Error("Nothing to change.");
  return entries.map((entry) => {
    const { featureId, state } = entry as { featureId?: unknown; state?: unknown };
    if (typeof featureId !== "string" || !FEATURE_ID.test(featureId)) throw new Error("That is not a feature id.");
    if (state !== "site" && !isFeatureState(state)) throw new Error("That is not a state.");
    return { featureId, state };
  });
}

async function log(admin: { id: string; email: string }, scope: string, subject: string, change: string): Promise<void> {
  await prisma.featureChange.create({ data: { scope, subject, change, byUserId: admin.id, byEmail: admin.email } });
}

/** The site's states: "on" removes the row, since a feature with no row is on. */
export async function setSiteFeaturesAction(entries: Array<{ featureId: string; state: StateChoice }>): Promise<void> {
  const admin = await requireAdmin();
  for (const { featureId, state } of checkedEntries(entries)) {
    if (state === "on" || state === "site") await prisma.featureState.deleteMany({ where: { featureId } });
    else
      await prisma.featureState.upsert({
        where: { featureId },
        create: { featureId, state: SWITCH[state], updatedBy: admin.email },
        update: { state: SWITCH[state], updatedBy: admin.email },
      });
    await log(admin, "SITE", "", `${featureId} → ${state === "site" ? "on" : state}`);
  }
  revalidatePath("/admin/features");
  revalidatePath("/");
}

/** A person's own states: "site" removes the row; "on" is kept as a row, since it lifts a lock the site or the tier has. */
export async function setUserFeaturesAction(userId: string, entries: Array<{ featureId: string; state: StateChoice }>): Promise<void> {
  const admin = await requireAdmin();
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
    await log(admin, "USER", userId, `${user.email}: ${featureId} → ${state === "site" ? "as the site" : state}`);
  }
  revalidatePath(`/admin/users/${userId}/features`);
  revalidatePath("/");
}

/** Makes a set and returns its id, so the page can show it at once. */
export async function createFeatureSetAction(name: string): Promise<string> {
  const admin = await requireAdmin();
  const trimmed = name.trim();
  if (!NAME.test(trimmed)) throw new Error("A set needs a name of up to 60 characters.");
  const set = await prisma.featureSet.create({ data: { name: trimmed } });
  await log(admin, "SET", set.id, `set "${trimmed}" made`);
  revalidatePath("/admin/features");
  return set.id;
}

export async function deleteFeatureSetAction(setId: string): Promise<void> {
  const admin = await requireAdmin();
  const set = await prisma.featureSet.findUnique({ where: { id: setId }, select: { name: true, tiers: { select: { id: true } } } });
  if (!set) throw new Error("No such set.");
  if (set.tiers.length > 0) throw new Error("A tier points at this set; detach it first.");
  await prisma.featureSet.delete({ where: { id: setId } });
  await log(admin, "SET", setId, `set "${set.name}" deleted`);
  revalidatePath("/admin/features");
}

/** A set's entries: "site" removes the entry; the other three are kept, "on" included. */
export async function setFeatureSetEntriesAction(setId: string, entries: Array<{ featureId: string; state: StateChoice }>): Promise<void> {
  const admin = await requireAdmin();
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
    await log(admin, "SET", setId, `set "${set.name}": ${featureId} → ${state === "site" ? "as the site" : state}`);
  }
  revalidatePath("/admin/features");
  revalidatePath("/");
}

export async function createTierAction(name: string): Promise<void> {
  const admin = await requireAdmin();
  const trimmed = name.trim();
  if (!NAME.test(trimmed)) throw new Error("A tier needs a name of up to 60 characters.");
  const tier = await prisma.tier.create({ data: { name: trimmed } });
  await log(admin, "TIER", tier.id, `tier "${trimmed}" made`);
  revalidatePath("/admin/features");
}

/** Which set a tier gives its people; null for none. */
export async function attachSetToTierAction(tierId: string, setId: string | null): Promise<void> {
  const admin = await requireAdmin();
  const tier = await prisma.tier.findUnique({ where: { id: tierId }, select: { name: true } });
  if (!tier) throw new Error("No such tier.");
  const set = setId ? await prisma.featureSet.findUnique({ where: { id: setId }, select: { name: true } }) : null;
  if (setId && !set) throw new Error("No such set.");
  await prisma.tier.update({ where: { id: tierId }, data: { featureSetId: setId } });
  await log(admin, "TIER", tierId, `tier "${tier.name}" → ${set ? `set "${set.name}"` : "no set"}`);
  revalidatePath("/admin/features");
  revalidatePath("/");
}
