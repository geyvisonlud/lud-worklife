/**
 * Google Drive for task attachments — pure helpers (links, search queries, file kinds). I/O is in drive-data.ts.
 * Scopes: drive.file (create the "Lud Worklife/<project>" folders and upload into them) + drive.readonly (search and
 * link files that are already in Drive). Nothing outside the app's own folders is ever changed.
 */

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive.readonly"];
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Name of the app's folder at the top of My Drive. */
export const ROOT_FOLDER = "Lud Worklife";
/** Files bigger than this go straight from the browser to Google (a hosting limit on request bodies). */
export const DIRECT_UPLOAD_OVER = 4 * 1024 * 1024;

export const hasDriveScope = (scopes: string | null | undefined) => {
  const s = scopes?.split(/\s+/) ?? [];
  return DRIVE_SCOPES.every((x) => s.includes(x));
};

/** The file id in a Drive / Docs / Sheets / Slides link, or null. */
export function parseDriveLink(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)(drive|docs)\.google\.com$/.test(u.hostname)) return null;
  const m = /\/(?:file|document|spreadsheets|presentation|forms|drawings)\/d\/([a-zA-Z0-9_-]{10,})/.exec(u.pathname) ?? /\/folders\/([a-zA-Z0-9_-]{10,})/.exec(u.pathname);
  if (m) return m[1];
  const id = u.searchParams.get("id");
  return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null;
}

/** Drive's `q` for a name search (quotes and backslashes escaped), skipping trashed files and folders. */
export function driveSearchQuery(text: string) {
  const t = text.trim().slice(0, 100).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const base = `trashed = false and mimeType != '${FOLDER_MIME}'`;
  return t ? `${base} and name contains '${t}'` : base;
}

/** Drive's `q` for a folder by name inside a parent. */
export const folderQuery = (name: string, parent: string) =>
  `mimeType = '${FOLDER_MIME}' and trashed = false and '${parent.replace(/'/g, "")}' in parents and name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** A short label for a file type ("Doc", "Sheet", "PDF", "Image"…). */
export function fileKind(mime: string | null | undefined, name = "") {
  const m = mime ?? "";
  if (m === "application/vnd.google-apps.document") return "Doc";
  if (m === "application/vnd.google-apps.spreadsheet") return "Sheet";
  if (m === "application/vnd.google-apps.presentation") return "Slides";
  if (m === "application/vnd.google-apps.form") return "Form";
  if (m === FOLDER_MIME) return "Folder";
  if (m === "application/pdf" || /\.pdf$/i.test(name)) return "PDF";
  if (m.startsWith("image/")) return "Image";
  if (m.startsWith("video/")) return "Video";
  if (m.startsWith("audio/")) return "Audio";
  if (/spreadsheet|excel|csv/.test(m) || /\.(xlsx?|csv)$/i.test(name)) return "Sheet";
  if (/word|document/.test(m) || /\.docx?$/i.test(name)) return "Doc";
  if (/presentation|powerpoint/.test(m) || /\.pptx?$/i.test(name)) return "Slides";
  if (/zip|compressed/.test(m)) return "Zip";
  return "File";
}

/** A folder name Drive is happy with (no slashes, trimmed, not empty). */
export const safeFolderName = (name: string) => name.replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled project";

/** A link pasted as an attachment: its title when nothing better is known ("example.com/path"). */
export function linkTitle(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path && path.length < 40 ? path : ""}`;
  } catch {
    return url.slice(0, 80);
  }
}

/**
 * Address of Drive's own viewer for a file (PDFs, images, Office files, Google Docs/Sheets/Slides…), shown in an
 * iframe. It loads with the viewer's Google session, so it works for files this browser's Google account can open.
 */
export const drivePreviewUrl = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;

/** Folders can't be previewed inline (they open in Drive). */
export const canPreviewInline = (mime: string | null | undefined) => mime !== FOLDER_MIME;

export const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

/** Type of a Google link from its address (for links added before Drive is connected). */
export function driveLinkMime(url: string): { mimeType: string | null; title: string } {
  const kinds: [RegExp, string, string][] = [
    [/\/document\/d\//, "application/vnd.google-apps.document", "Google Doc"],
    [/\/spreadsheets\/d\//, "application/vnd.google-apps.spreadsheet", "Google Sheet"],
    [/\/presentation\/d\//, "application/vnd.google-apps.presentation", "Google Slides"],
    [/\/forms\/d\//, "application/vnd.google-apps.form", "Google Form"],
    [/\/folders\//, FOLDER_MIME, "Google Drive folder"],
  ];
  for (const [re, mimeType, title] of kinds) if (re.test(url)) return { mimeType, title };
  return { mimeType: null, title: "Google Drive file" };
}
