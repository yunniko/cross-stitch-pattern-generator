import type { PixelBuffer } from "../types";
import type { PhotoEditor } from "./photo-editor";

/**
 * One state of the photo in hand (G-124): the pixels the page works from and the file the server is sent. After an edit
 * the file is the edited photo as a PNG (D349), and the pixels are the ones that PNG holds, so what is shown, generated
 * from and kept with the chart are the same photo.
 */
export interface PhotoMeta {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface PhotoStep {
  pixelBuffer: PixelBuffer;
  meta: PhotoMeta;
}

/**
 * The largest PNG an edited photo is kept as (D351). Below the upload cap (25 MB), and small enough that a chart carrying
 * the photo, which an export sends whole as base64, stays inside the export request cap (32 MB): 16 MB is 21.4 MB of
 * base64, leaving room for the largest chart's cells. `photo-step.spec.ts` holds both sums against the limits.
 */
export const EDITED_PHOTO_MAX_BYTES = 16 * 1024 * 1024;

/** What a step costs the history to keep: its pixels and its file, a string being two bytes a character. */
export function photoStepBytes(step: PhotoStep): number {
  return step.pixelBuffer.data.byteLength + step.meta.dataUrl.length * 2;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The edited photo could not be read back."));
    reader.readAsDataURL(blob);
  });
}

/** An edited photo as a step: encoded, made smaller where its PNG would be too large to send, and read back as a file. */
export async function editedPhotoStep(editor: PhotoEditor, photo: PixelBuffer): Promise<PhotoStep> {
  const { blob, photo: held } = await editor.encodePng(photo, EDITED_PHOTO_MAX_BYTES);
  const dataUrl = await blobToDataUrl(blob);
  return { pixelBuffer: held, meta: { dataUrl, naturalWidth: held.width, naturalHeight: held.height } };
}
