/** npm run sync — syncs every Google calendar and Notion workspace once (same as /api/cron/sync). */
import { syncAllCalendars } from "../src/lib/google-sync";
import { syncAllNotion } from "../src/lib/notion-sync";
import { prisma } from "../src/lib/db";

async function main() {
  const google = await syncAllCalendars();
  console.log(`Google: ${google.events} events from ${google.accounts} account(s)${google.errors.length ? ` — errors: ${google.errors.join("; ")}` : ""}`);
  const notion = await syncAllNotion();
  console.log(`Notion: ${notion.imported} new, ${notion.updated} updated, ${notion.tasks} to-dos${notion.errors.length ? ` — errors: ${notion.errors.join("; ")}` : ""}`);
}

main().finally(() => prisma.$disconnect());
