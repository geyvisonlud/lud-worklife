/**
 * The Notion "Dashboard Inbox": a database where tasks and projects are added from outside the app (e.g. by Claude,
 * which can write to Notion but not to this database). Each row is imported once — a task or a project — and from
 * then on it lives here. Pure parsing (tested); the sync is in notion-sync.ts.
 *
 * Properties (names are matched case-insensitively; Portuguese names work too):
 *   Name      title                         — required
 *   Type      select: Task | Project        — empty = Task          (Tipo: Tarefa | Projeto)
 *   Project   text or select: project name  — a task goes into it (created when missing); ignored for projects
 *   Due       date                          — due date (a project's target date)      (Entrega / Prazo / Data)
 *   Priority  select: High | Medium | Low   — tasks only            (Prioridade: Alta | Média | Baixa)
 *   Notes     text                          — task notes / project description       (Notas / Descrição)
 */
import type { NotionPage, NotionProperty, RichText } from "./notion";

export const INBOX_TITLE = "Dashboard Inbox";

export type InboxItem = {
  kind: "task" | "project";
  title: string;
  project: string | null;
  dueDate: string | null;
  priority: number;
  notes: string | null;
};

const ALIASES = {
  type: ["type", "tipo", "kind"],
  project: ["project", "projeto"],
  due: ["due", "due date", "deadline", "entrega", "data de entrega", "prazo", "data"],
  priority: ["priority", "prioridade"],
  notes: ["notes", "notas", "note", "nota", "description", "descrição", "descricao", "details", "detalhes"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** The property whose name matches one of the aliases (accent- and case-insensitive). */
function prop(props: Record<string, NotionProperty>, names: string[]) {
  const wanted = names.map(norm);
  const hit = Object.entries(props).find(([n]) => wanted.includes(norm(n)));
  return hit?.[1] ?? null;
}

const plain = (rich: unknown) => ((rich as RichText[] | undefined) ?? []).map((r) => r.plain_text).join("").trim();

/** Text of a title / rich_text / select / status / multi_select property. */
export function propText(p: NotionProperty | null): string | null {
  if (!p) return null;
  switch (p.type) {
    case "title":
      return plain(p.title) || null;
    case "rich_text":
      return plain(p.rich_text) || null;
    case "select":
      return ((p.select as { name?: string } | null)?.name ?? "").trim() || null;
    case "status":
      return ((p.status as { name?: string } | null)?.name ?? "").trim() || null;
    case "multi_select":
      return ((p.multi_select as { name?: string }[] | undefined) ?? []).map((o) => o.name).filter(Boolean).join(", ") || null;
    default:
      return null;
  }
}

/** "Project" / "Projeto" → project; anything else (or empty) → task. */
export function kindFrom(text: string | null): "task" | "project" {
  return text && /^(project|projeto|proj)/.test(norm(text)) ? "project" : "task";
}

/** High / Alta / Urgent → 3, Medium / Média / Normal → 2, Low / Baixa → 1, else 0. Also "P1"–"P3" and "!high". */
export function priorityFrom(text: string | null): number {
  if (!text) return 0;
  const t = norm(text).replace(/^!/, "");
  if (/^(high|alta|urgent|urgente|p1|1)/.test(t)) return 3;
  if (/^(medium|media|normal|p2|2)/.test(t)) return 2;
  if (/^(low|baixa|p3|3)/.test(t)) return 1;
  return 0;
}

/** A row of the inbox as a task or project to create, or null when it has no name yet (still being written). */
export function parseInboxRow(page: Pick<NotionPage, "properties">): InboxItem | null {
  const props = page.properties;
  const titleProp = Object.values(props).find((p) => p.type === "title") ?? null;
  const title = propText(titleProp);
  if (!title) return null;
  const due = prop(props, ALIASES.due);
  const date = due?.type === "date" ? (due.date as { start?: string; end?: string | null } | null) : null;
  const kind = kindFrom(propText(prop(props, ALIASES.type)));
  return {
    kind,
    title: title.slice(0, 300),
    project: kind === "task" ? propText(prop(props, ALIASES.project))?.slice(0, 200) ?? null : null,
    dueDate: date?.start ? (date.end ?? date.start).slice(0, 10) : null,
    priority: kind === "task" ? priorityFrom(propText(prop(props, ALIASES.priority))) : 0,
    notes: propText(prop(props, ALIASES.notes))?.slice(0, 5000) ?? null,
  };
}

/** Same project name, ignoring case, accents and extra spaces. */
export const sameProjectName = (a: string, b: string) => norm(a).replace(/\s+/g, " ") === norm(b).replace(/\s+/g, " ");
