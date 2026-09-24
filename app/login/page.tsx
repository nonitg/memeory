import { Brain } from "lucide-react";
import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  if (await hasSession()) redirect(next);
  const error = sp.error === "1";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-soft">
        <Brain className="h-6 w-6" strokeWidth={2.2} />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Open your brain</h1>
      <p className="mt-1 text-[15px] text-muted">Paste your brain key once. This device stays signed in for a year.</p>
      <form action="/api/login" method="post" className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next} />
        <input
          name="key"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          placeholder="Brain key"
          aria-invalid={error}
          className={`h-12 w-full rounded-2xl border bg-card px-4 text-[16px] outline-none focus:border-accent/60 ${error ? "border-danger" : "border-line"}`}
        />
        {error && <p className="text-sm text-danger">That key didn&apos;t match. Paste it again.</p>}
        <button className="h-12 w-full rounded-2xl bg-accent text-[15px] font-semibold text-white active:scale-[0.99]">
          Sign in
        </button>
      </form>
      <p className="mt-6 text-xs leading-relaxed text-faint">
        Your key is <code className="font-mono">BRAIN_SECRET</code>. On your Mac, run{" "}
        <code className="font-mono">pnpm key</code> in the project folder to copy it. Then paste it here, or AirDrop it to your phone.
      </p>
    </main>
  );
}
