/**
 * Launch screen while the app's data loads (server-rendered, no JS needed): the app icon, name and a quiet progress bar.
 * Icon + name sit exactly where iOS's launch image (public/splash/*.png) has them, so the hand-off doesn't jump.
 */
export function Splash() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg" role="status" aria-label="Loading Lud Worklife">
      <div className="splash-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={76} height={76} className="splash-pop rounded-[20px] shadow-[0_12px_40px_-12px_rgba(10,102,255,0.45)]" />
        <div className="splash-fade mt-5 text-[19px] font-semibold tracking-[-0.02em]">Lud Worklife</div>
        <div className="absolute left-1/2 top-full mt-5 h-[3px] w-28 -translate-x-1/2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="splash-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}
