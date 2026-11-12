import type { Calendar, Event, Note, NoteFolder, Prisma, Project } from "@prisma/client";
import { prisma } from "./db";
import { excerpt, folderTree, noteTitle, parseQuery } from "./notes";

export type NoteDTO = {
  id: string;
  title: string;
  /** Title, or the first line when the note has none. */
  displayTitle: string;
  excerpt: string;
  body: string;
  folderId: string | null;
  folderName: string | null;
  tags: string[];
  pinned: boolean;
  /** Palette key (lib/colors.ts) or null. */
  color: string | null;
  project: { id: string; name: string } | null;
  event: { start: string; allDay: boolean; calendar: string } | null;
  createdAt: string;
  updatedAt: string;
};
/** In tree order; `path` is "Parent / Child"; `count` is the folder's own notes. */
export type FolderDTO = { id: string; name: string; count: number; parentId: string | null; depth: number; path: string };

type NoteRow = Note & { folder?: NoteFolder | null; project?: Project | null; event?: (Event & { calendar?: Calendar }) | null };
export const NOTE_INCLUDE = { folder: true, project: true, event: { include: { calendar: true } } } as const;

export const noteDTO = (n: NoteRow): NoteDTO => ({
  id: n.id,
  title: n.title,
  displayTitle: noteTitle(n),
  excerpt: excerpt(n, 400),
  body: n.body,
  folderId: n.folderId,
  folderName: n.folder?.name ?? null,
  tags: n.tags,
  pinned: n.pinned,
  color: n.color,
  project: n.project ? { id: n.project.id, name: n.project.name } : null,
  event: n.event ? { start: n.event.start.toISOString(), allDay: n.event.allDay, calendar: n.event.calendar?.name ?? "" } : null,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
});

/** Every word must appear in the title, the text or a tag; "#tag" words filter by tag. */
export function noteWhere(opts: { q?: string; folderId?: string | null | string[]; tag?: string }): Prisma.NoteWhereInput {
  const { words, tags } = parseQuery(opts.q ?? "");
  if (opts.tag) tags.push(opts.tag);
  return {
    ...(Array.isArray(opts.folderId) ? { folderId: { in: opts.folderId } } : opts.folderId !== undefined ? { folderId: opts.folderId } : {}),
    ...(tags.length ? { tags: { hasEvery: tags } } : {}),
    AND: words.map((w) => ({
      OR: [{ title: { contains: w, mode: "insensitive" as const } }, { body: { contains: w, mode: "insensitive" as const } }, { tags: { has: w.toLowerCase().replace(/^#/, "") } }],
    })),
  };
}

/** Last edited (or added) first; `pinnedFirst` keeps pinned notes on top (the Notes page). */
export async function listNotes(opts: { q?: string; folderId?: string | null | string[]; tag?: string; take?: number; pinnedFirst?: boolean } = {}) {
  const rows = await prisma.note.findMany({
    where: noteWhere(opts),
    include: NOTE_INCLUDE,
    orderBy: opts.pinnedFirst ? [{ pinned: "desc" }, { updatedAt: "desc" }] : [{ updatedAt: "desc" }],
    take: opts.take ?? 200,
  });
  return rows.map(noteDTO);
}

export async function listFolders(): Promise<FolderDTO[]> {
  const rows = await prisma.noteFolder.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { notes: true } } } });
  return folderTree(rows).map((f) => ({ id: f.id, name: f.name, count: f._count.notes, parentId: f.parentId, depth: f.depth, path: f.path }));
}

/** Tags in use, most used first. */
export async function listTags() {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`SELECT unnest(tags) AS tag, COUNT(*) AS count FROM "Note" GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 60`;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
