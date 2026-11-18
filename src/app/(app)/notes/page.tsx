import { Suspense } from "react";
import { NotesWorkspace } from "@/components/Notes";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { listFolders, listNotes, listTags, noteDTO, NOTE_INCLUDE } from "@/lib/notes-data";
import { listCalendars } from "@/lib/data";
import { folderAndDescendants, noteTitle } from "@/lib/notes";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string; tag?: string; n?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 200);
  // A folder shows its own notes and those in its subfolders.
  const folders = await listFolders();
  const folderId = sp.folder === "none" ? null : sp.folder ? folderAndDescendants(folders, sp.folder) : undefined;
  const [notes, tags, total, unfiled, open, calendars, treeRows] = await Promise.all([
    listNotes({ q, folderId, tag: sp.tag, pinnedFirst: true }),
    listTags(),
    prisma.note.count(),
    prisma.note.count({ where: { folderId: null } }),
    sp.n ? prisma.note.findUnique({ where: { id: sp.n }, include: NOTE_INCLUDE }) : null,
    listCalendars(),
    prisma.note.findMany({ select: { id: true, title: true, body: true, folderId: true, pinned: true, color: true }, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 500 }),
  ]);
  const tree = treeRows.map((n) => ({ id: n.id, title: noteTitle(n), folderId: n.folderId, pinned: n.pinned, color: n.color }));
  return (
    <div>
      <div className={open ? "hidden" : "lg:hidden"}>
        <PageHeader eyebrow="Markdown · folders · tags" title="Notes" />
      </div>
      <Suspense>
        <NotesWorkspace
          notes={notes}
          folders={folders}
          tags={tags}
          open={open ? noteDTO(open) : null}
          filter={{ q, folder: sp.folder, tag: sp.tag }}
          total={total}
          unfiled={unfiled}
          tree={tree}
          calendars={calendars.filter((c) => c.canWrite).map((c) => ({ id: c.id, label: `${c.name} · ${c.accountEmail}${c.visible ? "" : " (hidden here)"}`, color: c.color }))}
        />
      </Suspense>
    </div>
  );
}
