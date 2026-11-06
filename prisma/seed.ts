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
    prisma.bibleDay.deleteMany(),
    prisma.bibleNote.deleteMany(),
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

  /* ------------------------------------------------------ Bible in a year */
  // Started two days ago (days 1–2 read); today is day 3: Genesis 5–6 and Matthew 2.
  await prisma.setting.create({ data: { key: "biblePlanStart", value: addDays(today, -2) } });
  await prisma.bibleDay.createMany({ data: [{ day: 1 }, { day: 2 }] });
  const note = (book: string, chapter: number, content: object) =>
    prisma.bibleNote.create({ data: { book, chapter, model: "demo", content: content as Prisma.InputJsonValue } });
  await note("Genesis", 5, {
    summary: "The family line from Adam to Noah. Ten generations are listed with the same rhythm — he lived, had sons and daughters, and then he died — until Noah, whose father hopes he will bring relief from the curse.",
    context: "Ancient Near Eastern peoples kept genealogies to show identity and inheritance; the Sumerian King List also gives enormous lifespans before a flood. Christians read the ages in different ways (literal years, symbolic numbers, or selective lists), but the point is the same: God's blessing and promise continue through a chosen line.",
    outline: [
      { verses: "1–2", title: "Made in God's likeness, blessed and named" },
      { verses: "3–20", title: "From Adam to Jared — 'and then he died'" },
      { verses: "21–24", title: "Enoch walked faithfully with God" },
      { verses: "25–32", title: "Methuselah, Lamech and Noah" },
    ],
    themes: ["The image of God passed on", "The reality of death", "Walking with God", "Hope for relief"],
    keyVerses: [
      { ref: "Genesis 5:24", note: "Enoch breaks the pattern of death: a life of close fellowship with God that ends with God taking him." },
      { ref: "Genesis 5:29", note: "Lamech names Noah in hope of comfort from the painful toil of the cursed ground — a longing the whole Bible carries forward." },
    ],
    crossReferences: [
      { ref: "Hebrews 11:5", note: "Enoch is remembered for the faith that pleased God." },
      { ref: "Romans 5:12", note: "Death entered the world through one man — the refrain of this chapter." },
      { ref: "Luke 3:36-38", note: "Luke traces Jesus' family line back through these names to Adam." },
    ],
    reflection: "In a list of lives that end the same way, one man is remembered for how he walked. Your day will be full of ordinary repetition too; what can make it different is walking it with God, step by step.",
    question: "What would 'walking with God' look like in the most ordinary hour of your day today?",
  });
  await note("Genesis", 6, {
    summary: "Human evil spreads until God grieves that he made mankind and resolves to send a flood. Noah, who walks faithfully with God, finds favor and is told to build an ark to save his family and the animals.",
    context: "Verses 1–4 (the 'sons of God' and the Nephilim) are among the most debated in Genesis: readers have seen them as fallen angels, the godly line of Seth marrying outside it, or tyrant kings. Flood stories exist across the ancient world, but Genesis presents the flood as the moral judgment of a holy and grieving God, not the whim of irritated gods.",
    outline: [
      { verses: "1–4", title: "The sons of God and the Nephilim" },
      { verses: "5–8", title: "The Lord's grief over human wickedness" },
      { verses: "9–12", title: "Noah, righteous in a corrupt world" },
      { verses: "13–22", title: "The ark and the first mention of covenant" },
    ],
    themes: ["God's grief over sin", "Grace in judgment", "Faithful obedience", "Covenant"],
    keyVerses: [
      { ref: "Genesis 6:8", note: "Before anything is said about Noah's goodness, the text says he found favor — grace comes first." },
      { ref: "Genesis 6:22", note: "Noah did everything just as God commanded: faith shown in long, unglamorous obedience." },
    ],
    crossReferences: [
      { ref: "Hebrews 11:7", note: "Noah built the ark by faith, warned about things not yet seen." },
      { ref: "Matthew 24:37-39", note: "Jesus compares his return to the days of Noah, when life went on as if nothing would happen." },
      { ref: "1 Peter 3:20-21", note: "The salvation of Noah's family through the water points to baptism." },
    ],
    reflection: "Noah's faithfulness was mostly invisible work: measuring, cutting, building, for years, before anyone could see why. Faithfulness today may look like doing the next right thing carefully, trusting God with the outcome.",
    question: "Where is God asking you for steady, unseen obedience right now?",
  });
  await note("Matthew", 2, {
    summary: "Magi from the east follow a star to worship the newborn king of the Jews, while King Herod plots to kill him. Warned in dreams, Joseph takes Mary and Jesus to Egypt, Herod massacres the boys of Bethlehem, and after Herod's death the family settles in Nazareth.",
    context: "Herod the Great was a ruthless client king of Rome who killed even members of his own family; he died around 4 BC, so Jesus was born a little before that. The Magi were probably scholar-astrologers from Persia or Babylon. Matthew shows Jesus reliving Israel's story — going down to Egypt and coming out again — and fulfilling the prophets.",
    outline: [
      { verses: "1–12", title: "The Magi worship the true king" },
      { verses: "13–15", title: "Escape to Egypt" },
      { verses: "16–18", title: "Herod's massacre in Bethlehem" },
      { verses: "19–23", title: "Return and settling in Nazareth" },
    ],
    themes: ["Jesus the true king", "Worship from the nations", "God's protection", "Fulfilled prophecy"],
    keyVerses: [
      { ref: "Matthew 2:10-11", note: "The Magi are overjoyed and bow down — outsiders recognize the king that Jerusalem's leaders ignore." },
      { ref: "Matthew 2:15", note: "'Out of Egypt I called my son' (Hosea 11:1): Jesus is the faithful Son that Israel was meant to be." },
    ],
    crossReferences: [
      { ref: "Micah 5:2", note: "The ruler of Israel would come from little Bethlehem." },
      { ref: "Numbers 24:17", note: "Balaam's oracle of a star rising out of Jacob." },
      { ref: "Isaiah 60:3-6", note: "Nations come to the light, bringing gold and incense." },
    ],
    reflection: "The same news brought joy to the Magi and fear to Herod. Jesus' kingship still does both: it either threatens our control or becomes our greatest joy. Today, bring him your 'gifts' — your time, attention and plans — and let him lead.",
    question: "Is there an area of your life where you are, like Herod, trying to stay in control instead of bowing to Jesus as king?",
  });

  await prisma.setting.create({ data: { key: "taskCalendarId", value: "" } });
  console.log(`Seeded ${events.length} events, 7 projects and tasks for the week of ${week} (${tz}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
