"use client";

import { usePathname } from "next/navigation";

/** Page container: centered and capped everywhere, full width on the calendar (week grid) and notes (Notion-like page). */
export function Main({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const wide = path.startsWith("/calendar") || path.startsWith("/notes") || path.startsWith("/read-later") || path.startsWith("/tasks") || path.startsWith("/projects");
  return <main className={`mx-auto px-4 pb-28 pt-5 md:pb-12 md:pl-64 md:pr-8 md:pt-8 ${wide ? "max-w-none" : "max-w-[1360px]"}`}>{children}</main>;
}
