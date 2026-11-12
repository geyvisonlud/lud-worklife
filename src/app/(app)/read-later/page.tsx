import { headers } from "next/headers";
import { ReadLater } from "@/components/ReadLater";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { captureToken, readItemDTO } from "@/lib/read-later-data";

export const dynamic = "force-dynamic";

export default async function ReadLaterPage() {
  const [items, token, h] = await Promise.all([prisma.readItem.findMany({ orderBy: { savedAt: "desc" }, take: 1000 }), captureToken(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const appUrl = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const unread = items.filter((i) => i.status === "unread").length;
  return (
    <div>
      <PageHeader eyebrow={`${unread} to read · links and notes from your phone`} title="Read Later" />
      <ReadLater items={items.map(readItemDTO)} token={token} appUrl={appUrl} />
    </div>
  );
}
