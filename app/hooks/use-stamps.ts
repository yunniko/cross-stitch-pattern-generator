import { useEffect, useState } from "react";
import { serializeStamp, stampFacts, stampFromPiece, stampName, type StampContents } from "@/lib/stamps/stamp";
import type { FloatingSelection, StitchPattern } from "@/lib/types";
import type { AccountSaveMessage } from "./use-account-save";

/**
 * The person's stamps from the editor (G-119, D360): saving the piece in hand as one, which asks for a name first, and how
 * many they keep, which Add stamp in the top bar waits for. The stamps themselves are the server's (`/api/stamps`).
 */
export function useStamps(pattern: StitchPattern | null, signedIn: boolean, usable: boolean) {
  /** The stamp being named: made from the piece when Save as stamp was pressed, so the piece may move on meanwhile. */
  const [naming, setNaming] = useState<StampContents | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<AccountSaveMessage | null>(null);
  /** How many stamps the person keeps; null until known, and for a visitor. */
  const [count, setCount] = useState<number | null>(null);

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
    try {
      const response = await fetch("/api/stamps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: serializeStamp(stamp),
      });
      const body = (await response.json().catch(() => null)) as { name?: string; error?: string } | null;
      if (response.status === 201 && body?.name) {
        setMessage({ tone: "info", text: `Saved “${body.name}” to your stamps.` });
        setCount((kept) => (kept === null ? null : kept + 1));
      } else {
        setMessage({ tone: "error", text: body?.error ?? "The stamp was not saved. Try again in a moment." });
      }
    } catch {
      setMessage({
        tone: "error",
        text: "Couldn't reach the server, so the stamp was not saved. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    count,
    message,
    dismissMessage: () => setMessage(null),
    /** Makes the stamp from the piece and asks for its name. */
    begin,
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

/** How many stamps the person keeps, read from their list; null when it cannot be read. */
async function keptCount(): Promise<number | null> {
  try {
    const response = await fetch("/api/stamps");
    if (!response.ok) return null;
    return ((await response.json()) as { stamps: unknown[] }).stamps.length;
  } catch {
    return null;
  }
}
