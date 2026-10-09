/**
 * Export all's editable entry for a chart of layers (G-130 M4, D393). The bundle is built on the server from the chart as it
 * is shown -- every visible layer flattened, which is what every other file in it draws -- and its editable entry is then
 * that flat chart. A chart of more than one layer gets its own editable save in its place, written in the page by the same
 * `serializeChart` the editable export uses, so the bundle reopens with every layer, its order, name and visibility.
 *
 * Every other entry is copied as it came: both exporters store their entries uncompressed, and JSZip writes a stored entry
 * it read back as the same bytes.
 */

/** The name the bundle gives its editable entry: `${baseName}_editable.json`, as both exporters write it. */
export const editableEntryName = (baseName: string) => `${baseName}_editable.json`;

/** `bundle` with its editable entry replaced by `editable`; refused by name when the bundle has no such entry. */
export async function withEditableEntry(bundle: Blob, baseName: string, editable: string): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
  const name = editableEntryName(baseName);
  if (!zip.file(name)) throw new Error(`The export bundle has no ${name} to keep the layers in.`);
  zip.file(name, editable);
  return zip.generateAsync({ type: "blob", mimeType: bundle.type || "application/zip" });
}
