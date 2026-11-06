/**
 * Demo data: two Google accounts (personal + work) with calendars in Google's colors, a week of events
 * around today, local and Notion-imported projects, and tasks (some already on the calendar).
 * Never run against a real database — it wipes everything first.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { addDays, appTimeZone, startOfWeek, ymdInTz, zonedToUtc } from "../src/lib/dates";

const prisma = new PrismaClient();
const tz = appTimeZone();
const today = ymdInTz(new Date(), tz);
const week = startOfWeek(today);
const at = (ymd: string, h: number, m = 0) => zonedToUtc(ymd, h * 60 + m, tz);
const allDay = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const ME = "demo-user";
const seg = (t: string, extra: Record<string, unknown> = {}) => ({ t, ...extra });
const me = { t: "@Geyvison", m: "user", me: 1 };

async function main() {
  await prisma.$transaction([
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.event.deleteMany(),
    prisma.calendar.deleteMany(),
    prisma.calendarAccount.deleteMany(),
    prisma.notionConnection.deleteMany(),
    prisma.syncRun.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.habit.deleteMany(),
  ]);

  /* ------------------------------------------------------------ calendars */
  const personal = await prisma.calendarAccount.create({
    data: { provider: "demo", email: "geyvison@gmail.com", name: "Geyvison Ludugério", lastSyncedAt: new Date() },
  });
  const work = await prisma.calendarAccount.create({
    data: { provider: "demo", email: "geyvison@acme.co", name: "Geyvison Ludugério", lastSyncedAt: new Date() },
  });
  const cal = async (accountId: string, name: string, color: string, extra: Partial<Prisma.CalendarCreateInput> = {}) =>
    prisma.calendar.create({ data: { accountId, externalId: `${name.toLowerCase().replace(/\s+/g, "-")}@demo`, name, color, canWrite: true, ...extra } as never });
  const cPersonal = await cal(personal.id, "Geyvison", "#039be5", { primary: true }); // Peacock
  const cFamily = await cal(personal.id, "Family", "#33b679"); // Sage
  const cChurch = await cal(personal.id, "Church", "#8e24aa"); // Grape
  const cHolidays = await cal(personal.id, "Holidays in United States", "#0b8043", { canWrite: false }); // Basil
  const cWork = await cal(work.id, "geyvison@acme.co", "#3f51b5", { primary: true }); // Blueberry
  const cTeam = await cal(work.id, "Product team", "#f4511e"); // Tangerine
  await cal(work.id, "Office hours", "#616161", { visible: false }); // Graphite, hidden

  type E = { cal: string; title: string; start: Date; end: Date; allDay?: boolean; color?: string; location?: string; meet?: boolean; declined?: boolean };
  const events: E[] = [];
  for (let i = -7; i < 21; i++) {
    const d = addDays(week, i);
    const wd = (i % 7 + 7) % 7; // 0 = Sunday
    if (wd >= 1 && wd <= 5) {
      events.push({ cal: cWork.id, title: "Daily standup", start: at(d, 9, 30), end: at(d, 9, 45), meet: true });
    }
    if (wd === 1) events.push({ cal: cTeam.id, title: "Sprint planning", start: at(d, 10), end: at(d, 11, 30), meet: true, location: "Room 4B" });
    if (wd === 2) events.push({ cal: cWork.id, title: "1:1 with Marina", start: at(d, 11), end: at(d, 11, 30), meet: true });
    if (wd === 2) events.push({ cal: cPersonal.id, title: "Gym", start: at(d, 7), end: at(d, 8) });
    if (wd === 3) events.push({ cal: cTeam.id, title: "Design review — onboarding", start: at(d, 14), end: at(d, 15), meet: true, color: "#e67c73" });
    if (wd === 3) events.push({ cal: cChurch.id, title: "Bible study", start: at(d, 19, 30), end: at(d, 21), location: "Igreja Batista Central" });
    if (wd === 4) events.push({ cal: cWork.id, title: "Roadmap sync", start: at(d, 13), end: at(d, 14), meet: true });
    if (wd === 4) events.push({ cal: cWork.id, title: "Vendor demo", start: at(d, 13, 30), end: at(d, 14, 15), meet: true, declined: i > 0 });
    if (wd === 4) events.push({ cal: cPersonal.id, title: "Gym", start: at(d, 7), end: at(d, 8) });
    if (wd === 5) events.push({ cal: cTeam.id, title: "Sprint review", start: at(d, 15), end: at(d, 16), meet: true });
    if (wd === 5) events.push({ cal: cFamily.id, title: "Pizza night", start: at(d, 19), end: at(d, 21) });
    if (wd === 6) events.push({ cal: cFamily.id, title: "Kids' soccer", start: at(d, 9), end: at(d, 10, 30), location: "Riverside Park" });
    if (wd === 0) events.push({ cal: cChurch.id, title: "Sunday service", start: at(d, 10), end: at(d, 12), location: "Igreja Batista Central" });
    if (wd === 0) events.push({ cal: cChurch.id, title: "Worship rehearsal", start: at(d, 17), end: at(d, 18, 30) });
  }
  events.push({ cal: cFamily.id, title: "Ana's birthday 🎂", start: allDay(addDays(week, 4)), end: allDay(addDays(week, 5)), allDay: true });
  events.push({ cal: cWork.id, title: "Q4 planning offsite", start: allDay(addDays(week, 9)), end: allDay(addDays(week, 11)), allDay: true });
  events.push({ cal: cHolidays.id, title: "Thanksgiving Day", start: allDay("2026-11-26"), end: allDay("2026-11-27"), allDay: true });
  events.push({ cal: cHolidays.id, title: "Veterans Day", start: allDay("2026-11-11"), end: allDay("2026-11-12"), allDay: true });
  events.push({ cal: cPersonal.id, title: "Dentist", start: at(addDays(week, 2), 16), end: at(addDays(week, 2), 17), location: "Smile Dental" });

  await prisma.event.createMany({
    data: events.map((e, i) => ({
      calendarId: e.cal,
      externalId: `demo-${i}`,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: Boolean(e.allDay),
      color: e.color ?? null,
      location: e.location ?? null,
      meetLink: e.meet ? "https://meet.google.com/abc-defg-hij" : null,
      htmlLink: "https://calendar.google.com/calendar/r",
      responseStatus: e.declined ? "declined" : e.meet ? "accepted" : null,
    })),
  });

  /* ------------------------------------------------- possible tasks (email) */
  const ago = (h: number) => new Date(Date.now() - h * 3600_000);
  const mail = (accountId: string, i: number, o: Partial<Prisma.EmailSuggestionUncheckedCreateInput> & { fromEmail: string; subject: string }) =>
    prisma.emailSuggestion.create({ data: { accountId, messageId: `demo-mail-${i}`, threadId: `demo-thread-${i}`, receivedAt: ago(i * 3), source: "claude", ...o } });
  await mail(work.id, 1, { fromName: "Marina Souza", fromEmail: "marina@acme.co", subject: "Q1 budget — need your sign-off", title: "Approve the Q1 onboarding budget", reason: "Asks you to sign off before finance closes the quarter", dueDate: addDays(today, 1), priority: 3, status: "pending" });
  await mail(work.id, 2, { fromName: "Rafael Lima", fromEmail: "rafael@acme.co", subject: "Re: Wizard wireframes", title: "Give Rafael feedback on the wizard wireframes", reason: "Waiting on your review to start the build", priority: 2, status: "pending" });
  await mail(personal.id, 3, { fromName: "Pastor João", fromEmail: "joao@igrejacentral.org", subject: "Ensaio da cantata", title: "Confirmar presença no ensaio de sábado", reason: "Asks you to confirm by Friday", dueDate: addDays(week, 5), priority: 1, status: "pending" });
  await mail(personal.id, 4, { fromName: "Smile Dental", fromEmail: "frontdesk@smiledental.com", subject: "Please complete your patient form", title: "Fill out the dental patient form", reason: "Needed before your appointment", dueDate: addDays(week, 2), priority: 1, status: "pending", source: "rules" });
  await mail(personal.id, 5, { fromEmail: "deals@shop.example.com", subject: "48h flash sale 🔥", status: "skipped", reason: "Gmail promotions tab" });
  await mail(work.id, 6, { fromName: "Marina Souza", fromEmail: "marina@acme.co", subject: "FYI: deck is in the drive", status: "none" });
  await prisma.calendarAccount.updateMany({ data: { lastEmailScanAt: ago(0.2) } });

  /* --------------------------------------------------------------- notion */
  await prisma.notionConnection.create({
    data: { method: "demo", workspaceId: "demo-acme", workspaceName: "Acme Co.", userId: ME, userName: "Geyvison Ludugério", userEmail: "geyvison@acme.co", lastSyncedAt: new Date(Date.now() - 18 * 60_000) },
  });
  await prisma.syncRun.create({ data: { kind: "notion", status: "SUCCESS", message: "3 new · 0 updated · 4 to-dos", imported: 3, finishedAt: new Date(Date.now() - 18 * 60_000), startedAt: new Date(Date.now() - 18 * 60_000) } });
  await prisma.syncRun.create({ data: { kind: "google", status: "SUCCESS", imported: events.length, finishedAt: new Date(Date.now() - 4 * 60_000), startedAt: new Date(Date.now() - 4 * 60_000) } });

  const notionProject = (p: { name: string; emoji: string; color: string; stage: string; parent: string; status: string; reason: string; due?: string; content: unknown[]; description: string; position: number }) =>
    prisma.project.create({
      data: {
        name: p.name,
        emoji: p.emoji,
        color: p.color,
        stage: p.stage,
        position: p.position,
        dueDate: p.due ?? null,
        description: p.description,
        source: "notion",
        notionPageId: `demo-${p.name}`,
        notionUrl: "https://www.notion.so",
        notionParent: p.parent,
        notionWorkspace: "Acme Co.",
        notionStatus: p.status,
        notionReason: p.reason,
        notionContent: p.content as Prisma.InputJsonValue,
        notionEditedAt: new Date(Date.now() - 3 * 3600_000),
        notionSyncedAt: new Date(Date.now() - 18 * 60_000),
      },
    });

  const onboarding = await notionProject({
    name: "New customer onboarding",
    emoji: "🚀",
    color: "violet",
    stage: "active",
    position: 1,
    parent: "Product Roadmap",
    status: "In progress",
    reason: "assigned:Owner",
    due: addDays(today, 24),
    description: "Cut time-to-first-value for new accounts from 9 days to 3 with a guided setup and a checklist inside the product.",
    content: [
      { id: "b1", type: "callout", icon: "🎯", text: [seg("Goal: cut time-to-first-value for new accounts from 9 days to 3.")] },
      { id: "b2", type: "h2", text: [seg("Context")] },
      { id: "b3", type: "p", text: [seg("Most churned accounts never finished setup. Interviews show the import step is the main drop-off; "), seg("Marina", { m: "user" }), seg(" has the research notes.")] },
      { id: "b4", type: "h2", text: [seg("Plan")] },
      { id: "b5", type: "ol", text: [seg("Guided setup wizard", { b: 1 }), seg(" — 4 steps, skippable")] },
      { id: "b6", type: "ol", text: [seg("In-app checklist with progress")] },
      { id: "b7", type: "ol", text: [seg("Day-2 and day-5 nudges by email")] },
      { id: "b8", type: "h2", text: [seg("Action items")] },
      { id: "t1", type: "todo", checked: false, text: [me, seg(" write the spec for the import step")] },
      { id: "t2", type: "todo", checked: false, text: [me, seg(" review copy for the checklist")] },
      { id: "t3", type: "todo", checked: true, text: [seg("Marina", { m: "user" }), seg(" share interview recordings")] },
      { id: "b9", type: "divider", text: [] },
      { id: "b10", type: "child", icon: "📄", text: [seg("Wizard wireframes")] },
    ],
  });
  const pricing = await notionProject({
    name: "Pricing page refresh",
    emoji: "💳",
    color: "orange",
    stage: "planned",
    position: 2,
    parent: "Marketing Projects",
    status: "Not started",
    reason: "mentioned",
    description: "Simplify the plans table and add annual billing.",
    content: [
      { id: "c1", type: "p", text: [seg("Simplify the plans table and add annual billing. "), me, seg(" can you own the comparison table?")] },
      { id: "c2", type: "todo", checked: false, text: [me, seg(" draft the comparison table")] },
      { id: "c3", type: "quote", text: [seg("Keep it to three plans.", { i: 1 })] },
    ],
  });
  const migration = await notionProject({
    name: "Data warehouse migration",
    emoji: "🗄️",
    color: "teal",
    stage: "hold",
    position: 1,
    parent: "Engineering Projects",
    status: "Blocked",
    reason: "assigned:Stakeholders",
    description: "Waiting on the security review before moving reports off the old warehouse.",
    content: [
      { id: "d1", type: "callout", icon: "⏸️", text: [seg("Blocked on the security review (ETA end of month).")] },
      { id: "d2", type: "todo", checked: false, text: [me, seg(" sign off on the dashboards list")] },
    ],
  });

  /* -------------------------------------------------------- local projects */
  const local = (name: string, emoji: string, color: string, stage: string, position: number, description?: string, dueDate?: string) =>
    prisma.project.create({ data: { name, emoji, color, stage, position, description, dueDate } });
  const website = await local("Personal website", "🌐", "blue", "active", 2, "Portfolio + blog on Next.js.", addDays(today, 40));
  const church = await local("Christmas cantata", "🎄", "green", "active", 3, "Music and projection for the Dec 20 service.", "2026-12-20");
  const home = await local("Garage cleanup", "🧰", "amber", "planned", 3);
  await local("Q3 OKR report", "📊", "graphite", "done", 1, "Shipped Oct 6.");

  /* ----------------------------------------------------------------- tasks */
  let pos = 0;
  type T = Partial<Prisma.TaskUncheckedCreateInput> & { title: string };
  const t = (x: T) => prisma.task.create({ data: { position: (pos += 1024), status: "todo", ...x } });
  const doneAt = new Date(Date.now() - 86400_000);
  await t({ title: "Write the spec for the import step", projectId: onboarding.id, notionBlockId: "t1", priority: 3, dueDate: addDays(today, 2), durationMin: 90, scheduledStart: at(today, 10) });
  await t({ title: "Review copy for the checklist", projectId: onboarding.id, notionBlockId: "t2", priority: 2, dueDate: addDays(today, 4), durationMin: 45 });
  await t({ title: "Prototype the wizard's first step", projectId: onboarding.id, status: "doing", durationMin: 120, scheduledStart: at(addDays(today, 1), 13) });
  await t({ title: "Define success metrics", projectId: onboarding.id, status: "done", completedAt: doneAt });
  await t({ title: "Email copy for day-2 nudge", projectId: onboarding.id, status: "backlog" });
  await t({ title: "Draft the comparison table", projectId: pricing.id, notionBlockId: "c2", priority: 2, dueDate: addDays(today, 7) });
  await t({ title: "Sign off on the dashboards list", projectId: migration.id, notionBlockId: "d2", dueDate: addDays(today, -2), priority: 1 });
  await t({ title: "Pick a blog theme", projectId: website.id, status: "doing", durationMin: 60 });
  await t({ title: "Write the About page", projectId: website.id, durationMin: 60, dueDate: addDays(today, 10) });
  await t({ title: "Set up the domain", projectId: website.id, status: "done", completedAt: doneAt });
  await t({ title: "Deploy to Vercel", projectId: website.id, status: "backlog" });
  await t({ title: "Lyrics slides for the cantata", projectId: church.id, priority: 2, dueDate: addDays(today, 12), durationMin: 90 });
  await t({ title: "Rehearsal schedule", projectId: church.id, status: "done", completedAt: doneAt });
  await t({ title: "Test projector with new laptop", projectId: church.id, scheduledStart: at(addDays(today, 3), 18), durationMin: 60 });
  await t({ title: "Donate old bikes", projectId: home.id, status: "backlog" });
  await t({ title: "Buy shelving", projectId: home.id, dueDate: addDays(today, 6), durationMin: 30 });
  await t({ title: "Renew passport", priority: 3, dueDate: today, durationMin: 30 });
  await t({ title: "Call the insurance about the claim", dueDate: today, durationMin: 15, scheduledStart: at(today, 16, 30) });
  await t({ title: "Reply to Pastor João", durationMin: 15 });
  await t({ title: "Plan Thanksgiving menu", dueDate: "2026-11-20", durationMin: 45 });
  await t({ title: "Read “Shape Up” ch. 4", durationMin: 30 });
  await t({ title: "Expense report for October", priority: 2, dueDate: addDays(today, -1), durationMin: 30 });
  await t({ title: "Back up photos", status: "done", completedAt: doneAt });

  /* ---------------------------------------------------------------- habits */
  // Deterministic "random" history so screenshots are stable.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const habit = async (name: string, emoji: string, color: string, targetPerWeek: number, daysBack: number, p: number, streak: number, position: number) => {
    const h = await prisma.habit.create({ data: { name, emoji, color, targetPerWeek, position, createdAt: new Date(`${addDays(today, -daysBack)}T12:00:00Z`) } });
    const days: string[] = [];
    for (let i = 1; i <= daysBack; i++) {
      const d = addDays(today, -i);
      if (i <= streak || rnd() < p) days.push(d);
    }
    await prisma.habitCheck.createMany({ data: days.map((day) => ({ habitId: h.id, day })) });
    return h;
  };
  const water = await habit("Drink 2L of water", "💧", "teal", 7, 120, 0.8, 12, 1);
  await habit("Read 20 minutes", "📖", "violet", 7, 200, 0.65, 4, 2);
  const prayer = await habit("Morning prayer", "🙏", "amber", 7, 300, 0.85, 26, 3);
  await habit("Gym", "💪", "orange", 3, 150, 0.42, 0, 4);
  await habit("English practice", "🇺🇸", "blue", 5, 60, 0.6, 2, 5);
  await prisma.habitCheck.createMany({ data: [water, prayer].map((h) => ({ habitId: h.id, day: today })) });

  await prisma.setting.create({ data: { key: "taskCalendarId", value: "" } });
  console.log(`Seeded ${events.length} events, 7 projects and tasks for the week of ${week} (${tz}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
