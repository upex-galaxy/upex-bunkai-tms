// BK-508 — shared constants for the workspace data export feature. Confirmed
// via the Shift-Left PO/Dev answers on the ticket (2026-08-24): the download
// window is 7 days (168h) from the moment the archive becomes ready.

export const EXPORT_DOWNLOAD_WINDOW_HOURS = 168;
export const EXPORT_STORAGE_BUCKET = 'workspace-exports';
