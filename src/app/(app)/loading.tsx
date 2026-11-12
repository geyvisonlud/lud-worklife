/** Shown instantly while a page's data loads (moving between pages inside the app). */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6">
        <div className="mb-3 h-2.5 w-32 rounded-full bg-surface-3" />
        <div className="h-8 w-56 rounded-[10px] bg-surface-3" />
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="card h-40 lg:col-span-12" />
        <div className="card h-64 lg:col-span-7" />
        <div className="card h-64 lg:col-span-5" />
      </div>
    </div>
  );
}
