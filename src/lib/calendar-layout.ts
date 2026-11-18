/**
 * Side-by-side layout for overlapping blocks in a day column (like Google Calendar):
 * blocks that overlap form a cluster; each gets a column, and the cluster's width is split evenly.
 */
export type Span = { id: string; start: number; end: number };
export type Placed = Span & { col: number; cols: number };

export function layoutDay(items: Span[], minHeight = 15): Placed[] {
  const sorted = [...items]
    .map((i) => ({ ...i, end: Math.max(i.end, i.start + minHeight) }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const out: Placed[] = [];
  let cluster: (Span & { col: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = cluster.reduce((m, c) => Math.max(m, c.col + 1), 0);
    for (const c of cluster) out.push({ ...c, cols });
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    // First column whose last block has ended.
    const colEnds: number[] = [];
    for (const c of cluster) colEnds[c.col] = Math.max(colEnds[c.col] ?? -1, c.end);
    let col = 0;
    while (colEnds[col] !== undefined && colEnds[col] > it.start) col++;
    cluster.push({ ...it, col });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

/**
 * Clips a range given in minutes relative to a day's midnight (negative = the day before, > 1440 = after)
 * to that day; null when it doesn't touch the day.
 */
export function clipToDay(startMin: number, endMin: number) {
  const s = Math.max(0, startMin);
  const e = Math.min(24 * 60, endMin);
  return e > s ? { start: s, end: e } : null;
}
