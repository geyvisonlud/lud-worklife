import { prisma } from "./db";
import { DRIVE_API, DRIVE_UPLOAD, FOLDER_MIME, ROOT_FOLDER, driveSearchQuery, folderQuery, hasDriveScope, safeFolderName } from "./drive";
import { googleApi } from "./google";
import { accessToken } from "./google-sync";
import { getSetting, setSetting } from "./settings";

/** Setting key: id of the app's "Lud Worklife" folder in My Drive (created on the first upload). */
const ROOT_KEY = "driveRootFolderId";
/** Folder for uploads to tasks without a project. */
const NO_PROJECT = "No project";

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; iconLink?: string; modifiedTime?: string; trashed?: boolean };
const FIELDS = "id,name,mimeType,webViewLink,iconLink,modifiedTime,trashed";

/** The Google account used for Drive: the first one that granted the Drive scopes. */
export async function driveAccount() {
  const accounts = await prisma.calendarAccount.findMany({ where: { provider: "google" }, orderBy: { createdAt: "asc" } });
  return accounts.find((a) => hasDriveScope(a.scopes)) ?? null;
}

export async function driveToken() {
  const a = await driveAccount();
  if (!a) throw new Error("Connect Google Drive first (Connections → your Google account → Allow Google Drive).");
  return accessToken(a);
}

/** Files in My Drive whose name contains `text` (recent first). */
export async function searchDrive(text: string) {
  const token = await driveToken();
  const r = await googleApi<{ files?: DriveFile[] }>(token, `${DRIVE_API}/files`, {
    query: { q: driveSearchQuery(text), fields: `files(${FIELDS})`, orderBy: "modifiedTime desc", pageSize: "12", supportsAllDrives: "true", includeItemsFromAllDrives: "true" },
  });
  return r.files ?? [];
}

export async function driveFile(id: string) {
  const token = await driveToken();
  return googleApi<DriveFile>(token, `${DRIVE_API}/files/${encodeURIComponent(id)}`, { query: { fields: FIELDS, supportsAllDrives: "true" } });
}

/** A folder (by stored id if it still exists, else found by name in `parent`, else created). */
async function ensureFolder(token: string, name: string, parent: string, knownId: string | null | undefined) {
  if (knownId) {
    const f = await googleApi<DriveFile>(token, `${DRIVE_API}/files/${encodeURIComponent(knownId)}`, { query: { fields: "id,trashed" } }).catch(() => null);
    if (f && !f.trashed) return knownId;
  }
  const found = await googleApi<{ files?: DriveFile[] }>(token, `${DRIVE_API}/files`, { query: { q: folderQuery(name, parent), fields: "files(id)", pageSize: "1" } });
  if (found.files?.[0]) return found.files[0].id;
  const created = await googleApi<DriveFile>(token, `${DRIVE_API}/files`, { method: "POST", body: { name, mimeType: FOLDER_MIME, parents: [parent] }, query: { fields: "id" } });
  return created.id;
}

/** "Lud Worklife/<project name>" (or "Lud Worklife/No project"), created when missing. */
export async function uploadFolder(token: string, projectId: string | null) {
  const root = await ensureFolder(token, ROOT_FOLDER, "root", await getSetting(ROOT_KEY));
  await setSetting(ROOT_KEY, root);
  if (!projectId) return ensureFolder(token, NO_PROJECT, root, null);
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return ensureFolder(token, NO_PROJECT, root, null);
  const id = await ensureFolder(token, safeFolderName(p.name), root, p.driveFolderId);
  if (id !== p.driveFolderId) await prisma.project.update({ where: { id: p.id }, data: { driveFolderId: id } });
  return id;
}

/** Small files: uploaded through the server (multipart). */
export async function uploadSmall(projectId: string | null, file: File) {
  const token = await driveToken();
  const folder = await uploadFolder(token, projectId);
  const boundary = `lud${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: file.name, parents: [folder] });
  const bytes = Buffer.from(await file.arrayBuffer());
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=${FIELDS}&supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Google Drive error ${res.status}`);
  return json as DriveFile;
}

/**
 * Big files: a resumable upload session the browser sends the file to directly (the session is opened for the app's
 * origin, so Google accepts the browser's PUT). Returns the upload URL.
 */
export async function startResumable(projectId: string | null, name: string, mimeType: string, size: number, origin: string) {
  const token = await driveToken();
  const folder = await uploadFolder(token, projectId);
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable&fields=${FIELDS}&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(size),
      Origin: origin,
    },
    body: JSON.stringify({ name, parents: [folder] }),
  });
  const url = res.headers.get("location");
  if (!res.ok || !url) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error?.message || `Google Drive error ${res.status}`);
  }
  return url;
}
