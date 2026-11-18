"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next, autoFocus = true }: { next: string; autoFocus?: boolean }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <input name="password" type="password" placeholder="Password" autoFocus={autoFocus} required className="input text-center" />
      {state?.error && <p className="text-[13px] text-bad">{state.error}</p>}
      <button className="btn btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
