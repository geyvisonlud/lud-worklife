import { googleLoginConfigured } from "@/lib/auth";
import { GoogleMark } from "@/components/ui";
import { LoginForm } from "./LoginForm";

const ERRORS: Record<string, string> = {
  not_allowed: "That account isn’t allowed to open this app. Add its email to ALLOWED_EMAILS.",
  unverified: "That account’s email isn’t verified.",
  invalid: "The sign-in couldn’t be verified. Please try again.",
  state: "The sign-in expired or was started in another tab. Please try again.",
  failed: "The sign-in didn’t go through. Please try again.",
  config: "Google sign-in isn’t set up yet.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const google = googleLoginConfigured();
  const password = Boolean(process.env.APP_PASSWORD);
  const nextQ = next && next.startsWith("/") && !next.startsWith("//") ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card animate-in w-full max-w-sm !p-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
        <h1 className="display text-[38px]">Lud Worklife</h1>
        <p className="mb-6 mt-1 text-[14px] text-ink-2">Sign in to continue.</p>
        {error && <p className="mb-4 rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">{ERRORS[error] ?? ERRORS.failed}</p>}
        {google && (
          <a href={`/api/auth/google${nextQ}`} className="btn btn-secondary w-full justify-center !py-2.5">
            <GoogleMark size={18} /> Continue with Google
          </a>
        )}
        {password && google && (
          <div className="my-5 flex items-center gap-3 text-[12px] text-ink-3">
            <span className="h-px flex-1 bg-[var(--hairline-strong)]" /> or use your password <span className="h-px flex-1 bg-[var(--hairline-strong)]" />
          </div>
        )}
        {password && <LoginForm next={next ?? "/"} autoFocus={!google} />}
        {!password && !google && <p className="text-[13px] text-ink-2">No sign-in is set up — the app is open.</p>}
      </div>
    </div>
  );
}
