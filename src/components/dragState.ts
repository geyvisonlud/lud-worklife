/**
 * What is being dragged right now. HTML5 drag events don't expose dataTransfer contents during
 * dragover, so sources also record the task here for the calendar's live drop preview.
 */
export const dragState: { task: { id: string; durationMin: number; grab: number } | null } = { task: null };
