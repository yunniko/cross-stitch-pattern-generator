import { useEffect, useMemo, useState } from "react";
import { getKeyValueStore, hashDataUrl } from "@/lib/editor/project-store";
import { deleteTry, inOrder, keepTry, pinTry, unpinTry, type Try, type TrySettings } from "@/lib/editor/tries";
import { createTriesStore, type TrySet } from "@/lib/editor/tries-store";
import type { StitchPattern } from "@/lib/types";
import { useLatest } from "./use-latest";

/**
 * The tries of the photo in hand (G-095 M4, D298): kept while the page is open and in the browser between visits.
 *
 * They follow the photo. With a photo in hand its tries are read from the store; tries kept for another photo are
 * dropped there, since that photo is gone; with no photo there are none to show. What is kept and what gives way is
 * `lib/editor/tries.ts`; this hook only holds the list and writes it down.
 */

const PHOTO_KEY_PREFIX = "photo:";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Writing the tries down is best effort: a browser that refuses leaves them for this visit only, as it does the open chart. */
function persist(write: Promise<void>): void {
  write.catch((error) => console.warn("The tries could not be saved in this browser:", error));
}

export function useTries(photoDataUrl: string | null) {
  const store = useMemo(() => createTriesStore(getKeyValueStore()), []);
  /** The tries last read or made, with the photo they belong to; null until a photo's have been read. */
  const [set, setSet] = useState<TrySet | null>(null);
  /** The photo in hand, by its key; null with none. */
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** The try last made or chosen: which of two same-chart tries the chart is (D403). */
  const [chosenId, setChosenId] = useState<string | null>(null);
  const latest = useLatest({ set, photoKey });

  useEffect(() => {
    let stale = false;
    void (async () => {
      if (photoDataUrl === null) {
        if (!stale) setPhotoKey(null);
        return;
      }
      const key = PHOTO_KEY_PREFIX + (await hashDataUrl(photoDataUrl));
      const empty: TrySet = { photoKey: key, nextNumber: 1, tries: [] };
      const stored = await store.loadFor(key, photoDataUrl).catch(() => empty);
      if (stale) return;
      setPhotoKey(key);
      // Tries made in this visit for this photo are the ones in memory already; what was read is for a photo just taken up.
      setSet((held) => (held && held.photoKey === key ? held : stored));
    })();
    return () => {
      stale = true;
    };
  }, [photoDataUrl, store]);

  /** The set the next change starts from: the photo in hand's, or nothing while there is no photo or its tries are still being read. */
  function current(): TrySet | null {
    const { set: held, photoKey: key } = latest.current;
    return held && key !== null && held.photoKey === key ? held : null;
  }

  function replace(next: TrySet, changes?: { made?: readonly Try[]; dropped?: readonly string[] }) {
    setSet(next);
    setRefusal(null);
    persist(store.save(next, changes));
  }

  const shown = set && photoKey !== null && set.photoKey === photoKey ? inOrder(set.tries) : [];

  return {
    /** The tries of the photo in hand, in the order they were made. */
    tries: shown,
    pinnedCount: shown.filter((entry) => entry.pinned).length,
    /** Why the last pin was refused, until the next change. */
    refusal,
    dismissRefusal: () => setRefusal(null),
    chosenId,
    /** A try was gone back to. */
    choose: (id: string) => setChosenId(id),

    /**
     * A Generate finished: its chart is kept as the newest try, and the oldest unpinned one gives way past five. The same
     * chart made with the same settings as a kept try is that try again, not a new one (D403).
     */
    add(pattern: StitchPattern, settings: TrySettings) {
      const held = current();
      if (!held) return;
      const now = Date.now();
      const made: Try = { id: newId(), number: held.nextNumber, madeAt: now, recentSince: now, pinned: false, settings, pattern };
      const { tries, dropped, currentId } = keepTry(held.tries, made);
      setChosenId(currentId);
      if (currentId !== made.id) replace({ ...held, tries });
      else replace({ ...held, nextNumber: held.nextNumber + 1, tries }, { made: [made], dropped: dropped.map((entry) => entry.id) });
    },

    pin(id: string) {
      const held = current();
      if (!held) return;
      const result = pinTry(held.tries, id);
      if ("refused" in result) setRefusal(result.refused);
      else replace({ ...held, tries: result.tries });
    },

    unpin(id: string) {
      const held = current();
      if (!held) return;
      const { tries, dropped } = unpinTry(held.tries, id, Date.now());
      replace({ ...held, tries }, { dropped: dropped.map((entry) => entry.id) });
    },

    remove(id: string) {
      const held = current();
      if (!held) return;
      replace({ ...held, tries: deleteTry(held.tries, id) }, { dropped: [id] });
    },
  };
}
