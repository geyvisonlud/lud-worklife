import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { noteTitle } from "@/lib/notes";

export const dynamic = "force-dynamic";

/** Search for the command palette: open tasks, projects and notes whose title (or note text) has every word typed. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return NextResponse.json({ tasks: [], projects: [], notes: [] });
  const has = (field: string) => ({ AND: words.map((w) => ({ [field]: { contains: w, mode: "insensitive" as const } })) });
  const [tasks, projects, notes] = await Promise.all([
    prisma.task.findMany({ where: { ...has("title"), archivedAt: null }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 8, select: { id: true, title: true, status: true, dueDate: true, project: { select: { name: true } } } }),
    prisma.project.findMany({ where: { ...has("name"), archived: false }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, name: true, emoji: true, color: true } }),
    prisma.note.findMany({ where: { AND: words.map((w) => ({ OR: [{ title: { contains: w, mode: "insensitive" as const } }, { body: { contains: w, mode: "insensitive" as const } }] })) }, orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, title: true, body: true } }),
  ]);
  return NextResponse.json(
    {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, done: t.status === "done", dueDate: t.dueDate, project: t.project?.name ?? null })),
      projects,
      notes: notes.map((n) => ({ id: n.id, title: noteTitle(n) })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
