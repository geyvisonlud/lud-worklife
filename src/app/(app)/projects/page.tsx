import { ProjectBoard } from "@/components/Kanban";
import { ProjectButton } from "@/components/ProjectSheet";
import { PageHeader, StatStrip } from "@/components/ui";
import { prisma } from "@/lib/db";
import { daysBetween } from "@/lib/dates";
import { listProjects, today } from "@/lib/data";

export default async function ProjectsPage() {
  const day = today();
  const [projects, openTasks] = await Promise.all([listProjects(), prisma.task.count({ where: { status: { not: "done" }, projectId: { not: null } } })]);
  const active = projects.filter((p) => p.stage === "active").length;
  const notion = projects.filter((p) => p.source === "notion");
  const dueSoon = projects.filter((p) => p.stage !== "done" && p.dueDate && daysBetween(day, p.dueDate) >= 0 && daysBetween(day, p.dueDate) <= 30);
  return (
    <div>
      <PageHeader eyebrow="Drag cards between columns" title="Projects">
        <ProjectButton />
      </PageHeader>
      <StatStrip
        className="mb-5"
        items={[
          { label: "In progress", value: String(active), hint: `${projects.filter((p) => p.stage === "planned").length} planned · ${projects.filter((p) => p.stage === "hold").length} on hold` },
          { label: "Open tasks", value: String(openTasks), hint: "Across all projects" },
          { label: "From Notion", value: String(notion.length), hint: `${notion.filter((p) => p.notionReason?.startsWith("assigned")).length} assigned · ${notion.filter((p) => p.notionReason === "mentioned").length} mentioned` },
          { label: "Due in 30 days", value: String(dueSoon.length), tone: dueSoon.length ? "warn" : undefined, hint: dueSoon[0] ? dueSoon[0].name : "Nothing due soon" },
        ]}
      />
      <ProjectBoard projects={projects} />
    </div>
  );
}
