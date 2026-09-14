/** Progress of a long export, reported per rendered page or step so the UI can show "Page 12 of 180" (G-035 M2). */
export interface ExportProgress {
  completed: number;
  total: number;
  label: string;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;
