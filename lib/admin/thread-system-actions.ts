"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin/require-admin";
import { logChange } from "@/lib/admin/change-log-data";
import { THREAD_SYSTEM_SCOPE } from "@/lib/admin/change-log";
import { prisma } from "@/lib/prisma";
import { readThreadList, THREAD_FILE_MAX_BYTES } from "@/lib/thread-systems/thread-list-file";
import { systemDetails, systemKeyRefusal, type ThreadRow } from "@/lib/thread-systems/thread-system";
import type { ActionResult } from "./feature-actions";

/**
 * The site's thread systems, as the admin keeps them (G-132 M3, D401): added from a file or typed list, edited, deleted.
 * Each is one row of data; nothing here runs code from a file. A system's key is fixed when it is added, since charts
 * store it; its switch (`brand.<key>`) is set on the Features page like any other, and goes with the system.
 */

export interface ThreadSystemInput {
  label: string;
  note?: string;
  source?: string;
  licence?: string;
}

const SITE = { ownerId: null } as const;

/** The threads of a list as sent (a file's text, or a list typed in), or what is wrong with it. */
function threadsOf(list: unknown): { threads: ThreadRow[] } | { error: string } {
  if (typeof list !== "string") return { error: "Give the threads as a file or a typed list." };
  if (new TextEncoder().encode(list).length > THREAD_FILE_MAX_BYTES) {
    return { error: `The list is larger than ${THREAD_FILE_MAX_BYTES / 1024} KB.` };
  }
  const read = readThreadList(list);
  return "error" in read ? read : { threads: read.threads };
}

function revalidate() {
  revalidatePath("/admin/thread-systems");
  revalidatePath("/admin/features");
  revalidatePath("/admin/changes");
  // The editor and the account read the systems as they draw.
  revalidatePath("/", "layout");
}

/** A new site system, offered after the others. */
export async function createThreadSystemAction(key: string, input: ThreadSystemInput, list: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const keyRefusal = systemKeyRefusal(key);
    if (keyRefusal) return { error: keyRefusal };
    const details = systemDetails(input);
    if ("error" in details) return details;
    const read = threadsOf(list);
    if ("error" in read) return read;
    const last = await prisma.threadSystem.findFirst({ where: SITE, orderBy: { position: "desc" }, select: { position: true } });
    try {
      await prisma.threadSystem.create({
        data: {
          key,
          ...details,
          threads: JSON.stringify(read.threads),
          threadCount: read.threads.length,
          position: (last?.position ?? -1) + 1,
        },
      });
    } catch (error) {
      // The site's keys are unique by a partial index; two adding the same key at once meet it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        return { error: `There is already a system "${key}".` };
      throw error;
    }
    await logChange(admin, THREAD_SYSTEM_SCOPE, key, `${details.label} (${key}) added, ${read.threads.length} threads`);
    revalidate();
    return {};
  } catch (error) {
    // A refusal travels as `error`, never thrown: production replaces a thrown message with a generic one (feature-actions).
    return { error: error instanceof Error ? error.message : "The system was not added." };
  }
}

/** A site system's name, note, source and licence; and its threads, when a new list is given. */
export async function updateThreadSystemAction(key: string, input: ThreadSystemInput, list: string | null): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const details = systemDetails(input);
    if ("error" in details) return details;
    const read = list === null ? null : threadsOf(list);
    if (read && "error" in read) return read;
    const before = await prisma.threadSystem.findFirst({ where: { ...SITE, key }, select: { id: true, label: true, threadCount: true } });
    if (!before) return { error: "There is no such system." };
    await prisma.threadSystem.update({
      where: { id: before.id },
      data: { ...details, ...(read ? { threads: JSON.stringify(read.threads), threadCount: read.threads.length } : {}) },
    });
    const changes = [
      ...(before.label !== details.label ? [`renamed from ${before.label}`] : []),
      ...(read ? [`threads replaced (${before.threadCount} → ${read.threads.length})`] : []),
    ];
    await logChange(
      admin,
      THREAD_SYSTEM_SCOPE,
      key,
      `${details.label} (${key}): ${changes.length ? changes.join(", ") : "details edited"}`
    );
    revalidate();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The system was not saved." };
  }
}

/**
 * Deletes a site system and its switch everywhere it was set. Charts keep their colours: a colour of a system that is gone
 * keeps its number and system, and is edited with the common colour picker (G-132 AC2).
 */
export async function deleteThreadSystemAction(key: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const featureId = `brand.${key}`;
    const deleted = await prisma.$transaction(async (tx) => {
      const row = await tx.threadSystem.findFirst({ where: { ...SITE, key }, select: { id: true, label: true } });
      if (!row) return null;
      await tx.threadSystem.delete({ where: { id: row.id } });
      await tx.featureState.deleteMany({ where: { featureId } });
      await tx.featureSetEntry.deleteMany({ where: { featureId } });
      await tx.userFeature.deleteMany({ where: { featureId } });
      return row;
    });
    if (!deleted) return { error: "There is no such system." };
    await logChange(admin, THREAD_SYSTEM_SCOPE, key, `${deleted.label} (${key}) deleted, with its switches`);
    revalidate();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The system was not deleted." };
  }
}
