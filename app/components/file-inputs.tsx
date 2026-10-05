"use client";

import type { ChangeEvent, RefObject } from "react";

/**
 * The three file choosers (out of the workspace in G-098). They stay mounted and keep their names: a control that exists
 * only inside a transient screen cannot be reached by assistive technology, by a script, or by anything addressing it by
 * name. The start screen's cards and the commands press these very elements, through the refs.
 */
export interface FileInputsProps {
  photoRef: RefObject<HTMLInputElement | null>;
  openRef: RefObject<HTMLInputElement | null>;
  pixelArtRef: RefObject<HTMLInputElement | null>;
  onPhoto: (file: File) => void;
  onOpen: (file: File) => void;
  onPixelArt: (file: File) => void;
  /** A photo cannot be chosen while one is being read or a chart generated. */
  photoDisabled: boolean;
}

/** Hands on the file that was chosen, and empties the chooser so the same file can be chosen again. */
const taking = (handle: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) handle(file);
};

export function FileInputs({ photoRef, openRef, pixelArtRef, onPhoto, onOpen, onPixelArt, photoDisabled }: FileInputsProps) {
  return (
    <>
      <label className="hidden" title="Import pixel art as a chart">
        <span id="pixel-art-input-label">Pixel art</span>
        <input
          ref={pixelArtRef}
          id="pixel-art-input"
          type="file"
          accept="image/png,image/gif,image/webp,image/bmp"
          onChange={taking(onPixelArt)}
        />
      </label>
      <label className="hidden" title="Choose a photo to generate a chart from">
        <span id="image-input-label">Image</span>
        <input
          ref={photoRef}
          id="image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={taking(onPhoto)}
          disabled={photoDisabled}
        />
      </label>
      <input
        ref={openRef}
        type="file"
        aria-label="Open pattern file"
        accept=".json,.zip,.cspzip,.oxs,application/json,application/zip"
        onChange={taking(onOpen)}
        className="hidden"
      />
    </>
  );
}
