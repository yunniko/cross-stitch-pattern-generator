import { useEffect, useState } from "react";
import { apiJson, refusalOf } from "@/lib/api-json";
import {
  parseStamp,
  serializeStamp,
  stampFacts,
  stampFromPiece,
  stampName,
  type StampCard,
  type StampContents,
  type StampList,
} from "@/lib/stamps/stamp";
import type { StampFaceStamp } from "../components/stamp-face";
import type { FloatingSelection, StitchPattern } from "@/lib/types";
import type { AccountSaveMessage } from "./use-account-save";

/**
 * The person's stamps from the editor (G-119, D360): saving the piece in hand as one, which asks for a name first; how
 * many they keep, which Add stamp in the top bar waits for; and Add stamp's gallery, read afresh each time it opens, from
 * which a stamp is read whole and handed to `place`. The stamps themselves are the server's (`/api/stamps`).
 */
export function useStamps(pattern: StitchPattern | null, signedIn: boolean, usable: boolean) {
  /** The stamp being named: made from the piece when Save as stamp was pressed, so the piece may move on meanwhile. */
  const [naming, setNaming] = useState<StampContents | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<AccountSaveMessage | null>(null);
  /** How many stamps the person keeps; null until known, and for a visitor. */
  const [count, setCount] = useState<number | null>(null);
  /** Add stamp's gallery while it is open: the list (null while it is read), why something failed, the stamp being read. */
  const [gallery, setGallery] = useState<{ stamps: StampFaceStamp[] | null; error: string | null; placing: string | null } | null>(null);

  useEffect(() => {
    if (!signedIn || !usable) return;
    let live = true;
    void keptCount().then((kept) => live && setCount(kept));
    return () => {
      live = false;
    };
  }, [signedIn, usable]);
  function begin(piece: FloatingSelection) {
    if (!pattern || busy) return;
    const stamp = stampFromPiece(pattern, piece, "");
    if (!stamp) return setMessage({ tone: "error", text: "The piece has nothing in it, so there is nothing to keep as a stamp." });
    setMessage(null);
    setNaming(stamp);
  }

  async function save(name: string) {
    if (!naming || busy) return;
    const stamp: StampContents = { ...naming, pattern: { ...naming.pattern, name: stampName(name) } };
    setNaming(null);
    setBusy(true);
    const answer = await apiJson<StampCard>(
      "/api/stamps",
      { method: "POST", headers: { "content-type": "application/json" }, body: serializeStamp(stamp) },
      {
        refused: "The stamp was not saved. Try again in a moment.",
        unreachable: "Couldn't reach the server, so the stamp was not saved. Check your connection and try again.",
      }
    );
    setBusy(false);
    if (answer.ok) {
      setMessage({ tone: "info", text: `Saved “${answer.body.name}” to your stamps.` });
      setCount((kept) => (kept === null ? null : kept + 1));
    } else setMessage({ tone: "error", text: answer.error });
  }

  async function openGallery() {
    setGallery({ stamps: null, error: null, placing: null });
    const listed = await keptStamps();
    setGallery(
      (open) =>
        open && (listed ? { ...open, stamps: listed } : { ...open, stamps: [], error: "Couldn't read your stamps. Try again in a moment." })
    );
    if (listed) setCount(listed.length);
  }

  /** Reads the stamp chosen and hands it to `place`, which answers why the chart refused it, or null once it is in hand. */
  async function choose(id: string, place: (stamp: StampContents) => string | null) {
    setGallery((open) => open && { ...open, placing: id, error: null });
    let refusal: string | null;
    try {
      const response = await fetch(`/api/stamps/${encodeURIComponent(id)}`);
      if (response.ok) refusal = place(parseStamp(await response.text()));
      else refusal = await refusalOf(response, "That stamp could not be read. Try again in a moment.");
    } catch {
      refusal = "Couldn't reach the server, so the stamp was not placed. Check your connection and try again.";
    }
    setGallery((open) => open && (refusal === null ? null : { ...open, placing: null, error: refusal }));
  }

  return {
    busy,
    count,
    message,
    dismissMessage: () => setMessage(null),
    /** Makes the stamp from the piece and asks for its name. */
    begin,
    openGallery: () => void openGallery(),
    gallery: gallery && {
      ...gallery,
      choose: (id: string, place: (stamp: StampContents) => string | null) => void choose(id, place),
      close: () => setGallery(null),
    },
    naming: naming && { save: (name: string) => void save(name), cancel: () => setNaming(null), facts: factsOf(naming) },
  };
}

const factsOf = ({ pattern }: StampContents) =>
  stampFacts({
    width: pattern.width,
    height: pattern.height,
    colors: pattern.palette.length,
    backstitch: Boolean(pattern.backstitch?.length),
  });

/** The person's stamps as cards, pinned first and then the newest; null when they cannot be read. */
async function keptStamps(): Promise<StampFaceStamp[] | null> {
  const answer = await apiJson<StampList>("/api/stamps", { cache: "no-store" }, { refused: "", unreachable: "" });
  return answer.ok ? answer.body.stamps : null;
}

/** How many stamps the person keeps; null when it cannot be read. */
const keptCount = async () => (await keptStamps())?.length ?? null;
