"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { createProject, deleteProject, refreshNotionProject, updateProject } from "@/app/actions";
import { PROJECT_COLORS } from "@/lib/colors";
import type { ProjectDTO } from "@/lib/data";
import { Field, Sheet } from "./Sheet";
import { useReport, useWork } from "./TaskSheet";
import { columnColor } from "./ui";

const EMOJIS = ["🚀", "📊", "🎯", "💡", "🛠️", "📝", "🌐", "🎄", "📚", "💳", "🏠", "✈️", "🎨", "🧪", "📣", "🤝"];

export function ProjectButton({ project, compact }: { project?: ProjectDTO; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button className="rounded-[6px] p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setOpen(true)} aria-label="New project" title="New project">
          <Plus size={14} />
        </button>
      ) : project ? (
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          <Pencil size={14} /> Edit
        </button>
      ) : (
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={15} /> New project
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={project ? "Edit project" : "New project"}>
        {open && <ProjectForm project={project} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

/** The new/edit project sheet, controlled (the boards open it with a column preset). */
export function ProjectSheet({ open, onClose, stage, project }: { open: boolean; onClose: () => void; stage?: string; project?: ProjectDTO }) {
  return (
    <Sheet open={open} onClose={onClose} title={project ? "Edit project" : "New project"}>
      {open && <ProjectForm project={project} stage={stage} onDone={onClose} />}
    </Sheet>
  );
}

function ProjectForm({ project, onDone, stage: initialStage }: { project?: ProjectDTO; onDone: () => void; stage?: string }) {
  const router = useRouter();
  const report = useReport();
  const { projectColumns } = useWork();
  const [pending, start] = useTransition();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [emoji, setEmoji] = useState(project?.emoji ?? "🚀");
  const [color, setColor] = useState(project?.color ?? "blue");
  const [stage, setStage] = useState(project?.stage ?? initialStage ?? "planned");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  const [confirm, setConfirm] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { name, description, emoji, color, stage, dueDate: dueDate || null };
    start(async () => {
      if (project) {
        if (report(await updateProject(project.id, input))) onDone();
      } else {
        const r = await createProject(input);
        if (report(r) && r.ok && "id" in r && r.id) {
          onDone();
          router.push(`/projects/${r.id}`);
        }
      }
    });
  };

  return (
    <form onSubmit={save} className="space-y-3.5">
      <div className="flex gap-2">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="input !w-14 text-center !text-[20px]" aria-label="Emoji" maxLength={8} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="input !text-[17px] font-medium" required autoFocus={!project} />
      </div>
      <div className="flex flex-wrap gap-1">
        {EMOJIS.map((x) => (
          <button key={x} type="button" onClick={() => setEmoji(x)} className={`rounded-lg px-1.5 py-0.5 text-[18px] ${emoji === x ? "bg-surface-3" : "hover:bg-surface-2"}`}>
            {x}
          </button>
        ))}
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it about?" rows={2} className="input resize-y !text-[14px]" />
      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {Object.entries(PROJECT_COLORS).map(([k, c]) => (
            <button
              key={k}
              type="button"
              aria-label={c.label}
              aria-pressed={color === k}
              onClick={() => setColor(k)}
              className="h-7 w-7 rounded-full transition-transform hover:scale-110"
              style={{ background: c.hex, boxShadow: color === k ? `0 0 0 2px var(--surface), 0 0 0 4px ${c.hex}` : undefined }}
            />
          ))}
        </div>
      </Field>
      <Field label="Stage" hint={project?.source === "notion" ? "Changing it here stops Notion's status from moving this card." : undefined}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup">
          {projectColumns
            .filter((c) => !c.hidden || c.key === stage)
            .map((c) => (
              <label key={c.key} className="chip inline-flex cursor-pointer items-center gap-1.5 has-[:checked]:!border-ink has-[:checked]:!bg-ink has-[:checked]:!text-surface">
                <input type="radio" name="stage" checked={stage === c.key} onChange={() => setStage(c.key)} className="sr-only" />
                <span className="h-2 w-2 rounded-full" style={{ background: columnColor(c.color) }} />
                {c.label}
              </label>
            ))}
        </div>
      </Field>
      <Field label="Target date">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input !text-[14px]" />
      </Field>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {project &&
          (confirm ? (
            <>
              <button type="button" className="btn btn-danger" disabled={pending} onClick={() => start(() => deleteProject(project.id))}>
                Delete, keep tasks
              </button>
              <button type="button" className="btn btn-danger" disabled={pending} onClick={() => start(() => deleteProject(project.id, true))}>
                Delete with tasks
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)} aria-label="Delete project">
              <Trash2 size={14} />
            </button>
          ))}
        <button className="btn btn-primary ml-auto" disabled={pending}>
          {pending ? "Saving…" : project ? "Save" : "Create project"}
        </button>
      </div>
    </form>
  );
}

export function RefreshNotion({ id }: { id: string }) {
  const report = useReport();
  const [pending, start] = useTransition();
  return (
    <button className="icon-btn" aria-label="Re-import from Notion" title="Re-import from Notion" disabled={pending} onClick={() => start(async () => void report(await refreshNotionProject(id)))}>
      <RefreshCw size={15} className={pending ? "animate-spin" : ""} />
    </button>
  );
}
