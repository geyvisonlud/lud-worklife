"use client";

import { useEffect } from "react";
import type { TaskDTO } from "@/lib/data";
import { useWork } from "./TaskSheet";

/** Opens a task's editor on load (links like /tasks?task=…, e.g. from a Google event's description). */
export function OpenTask({ task }: { task: TaskDTO | null }) {
  const { openTask } = useWork();
  useEffect(() => {
    if (task) openTask(task);
  }, [task, openTask]);
  return null;
}
