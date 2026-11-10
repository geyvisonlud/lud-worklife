import { Suspense } from "react";
import { NotesWorkspace } from "@/components/Notes";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { listFolders, listNotes, listTags, noteDTO, NOTE_INCLUDE } from "@/lib/notes-data";
import { listCalendars } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string; tag?: string; n?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 200);
  const folderId = sp.folder === "none" ? null : sp.folder || undefined;
  const [notes, folders, tags, total, unfiled, open, calendars] = await Promise.all([
    listNotes({ q, folderId, tag: sp.tag, pinnedFirst: true }),
    listFolders(),
    listTags(),
    prisma.note.count(),
    prisma.note.count({ where: { folderId: null } }),
    sp.n ? prisma.note.findUnique({ where: { id: sp.n }, include: NOTE_INCLUDE }) : null,
    listCalendars(),
  ]);
  return (
    <div>
      <div className={open ? "hidden lg:block" : ""}>
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
          calendars={calendars.filter((c) => c.canWrite).map((c) => ({ id: c.id, label: `${c.name} · ${c.accountEmail}${c.visible ? "" : " (hidden here)"}`, color: c.color }))}
        />
      </Suspense>
    </div>
  );
}
