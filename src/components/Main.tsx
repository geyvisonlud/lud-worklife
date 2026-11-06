"use client";

import { usePathname } from "next/navigation";

/** Page container: centered and capped everywhere, full width on the calendar (more room for the week grid). */
export function Main({ children }: { children: React.ReactNode }) {
  const wide = usePathname().startsWith("/calendar");
  return <main className={`mx-auto px-4 pb-28 pt-5 md:pb-12 md:pl-64 md:pr-8 md:pt-8 ${wide ? "max-w-none" : "max-w-[1360px]"}`}>{children}</main>;
}
