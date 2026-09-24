import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { Bookmarklet, Code, CopyButton, DigestControls } from "@/components/setup-bits";
import { requireSession } from "@/lib/auth";
import { setupStatus, type Step, type StepId } from "@/lib/setup";

export const metadata = { title: "Setup · Brain" };

function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-2.5 pl-5 text-[15px] leading-relaxed text-ink marker:text-faint">{children}</ol>;
}

function Terminal({ lines }: { lines: string[] }) {
  return (
    <div className="mt-1.5 space-y-1.5">
      {lines.map((l) => (
        <Code key={l}>{l}</Code>
      ))}
    </div>
  );
}

export default async function Setup() {
  await requireSession("/setup");
  const s = await setupStatus();
  const nextStep = s.steps.find((x) => !x.done)?.id;
  const captureUrl = `${s.appUrl}/api/capture?format=text`;

  const body: Record<StepId, React.ReactNode> = {
    first: (
      <p className="text-[15px] text-ink">
        Go to the <Link href="/" className="font-medium text-accent-ink underline decoration-accent/30 underline-offset-2">home screen</Link> and type anything. Press Enter. Done.
      </p>
    ),
    ai: (
      <Ol>
        <li>
          Get a key at{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="font-medium text-accent-ink underline decoration-accent/30 underline-offset-2">
            openrouter.ai/keys
          </a>{" "}
          and add $5 of credit. That covers months of captures.
        </li>
        <li>
          In Terminal, in the project folder, run this and paste the key when asked (it stays hidden):
          <Terminal lines={["pnpm secret OPENROUTER_API_KEY", "pnpm ship"]} />
        </li>
        <li className="text-muted">
          Models: <code className="font-mono text-[13px]">{s.models.fast}</code> files captures and answers questions. Change it any time with{" "}
          <code className="font-mono text-[13px]">pnpm secret LLM_MODEL_FAST</code>.
        </li>
      </Ol>
    ),
    iphone: (
      <Ol>
        <li>
          Open <b>Shortcuts</b>, tap <b>+</b>, name it <b>Save to Brain</b>.
        </li>
        <li>
          Tap the <b>ⓘ</b> button. Turn on <b>Show in Share Sheet</b>. Set it to receive <b>Text, URLs, Safari web pages</b>, and set{" "}
          <b>If there&apos;s no input</b> to <b>Ask For Text</b>.
        </li>
        <li>
          Add the action <b>Get Contents of URL</b>. Paste this URL:
          <div className="mt-1.5">
            <Code>{captureUrl}</Code>
          </div>
        </li>
        <li>
          Tap <b>Show More</b>. Method <b>POST</b>. Add a header: key <code className="font-mono text-[13px]">Authorization</code>, value{" "}
          <code className="font-mono text-[13px]">Bearer </code> followed by your key. <CopyButton fetchKey label="Copy key" />
        </li>
        <li>
          Request Body <b>JSON</b>. Add a Text field <code className="font-mono text-[13px]">text</code> set to <b>Shortcut Input</b>. Add a Text field{" "}
          <code className="font-mono text-[13px]">source</code> set to <b>Device Details → Device Model</b> (or just type <i>iphone</i>).
        </li>
        <li>
          Add <b>Show Notification</b> with <b>Contents of URL</b>. You&apos;ll see “✓ Saved: title” every time.
        </li>
        <li>
          Settings → <b>Action Button</b> → Shortcut → <b>Save to Brain</b>. Now: press, speak or type, done. “Hey Siri, Save to Brain” works too.
        </li>
        <li className="text-muted">
          Also: open this site in Safari, tap Share → <b>Add to Home Screen</b> for the full app.
        </li>
      </Ol>
    ),
    browser: (
      <Ol>
        <li>
          Show your bookmarks bar (<kbd className="font-sans">⌘⇧B</kbd> in Chrome or Arc). Drag this button onto it:
          <div className="mt-2">
            <Bookmarklet appUrl={s.appUrl} />
          </div>
        </li>
        <li>On any page, click it. Highlight text first to save it as a quote. A small window confirms and closes itself.</li>
      </Ol>
    ),
    mac: (
      <Ol>
        <li>
          Your iPhone shortcut syncs to the Mac. Open <b>Shortcuts</b> on the Mac and find <b>Save to Brain</b>.
        </li>
        <li>
          Open its <b>ⓘ</b> details. Click <b>Add Keyboard Shortcut</b> and press <kbd className="font-sans">⌃⌥Space</kbd>.
        </li>
        <li>
          Turn on <b>Use as Quick Action</b> → <b>Services Menu</b>. Now you can select text in any app and pick Services → Save to Brain.
        </li>
      </Ol>
    ),
    digest: (
      <div className="space-y-5">
        <DigestControls />
        <div>
          <p className="mb-2 text-sm font-semibold">WhatsApp (about 30 minutes, once)</p>
          <Ol>
            <li>
              Go to{" "}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="font-medium text-accent-ink underline decoration-accent/30 underline-offset-2">
                developers.facebook.com/apps
              </a>{" "}
              → Create app → <b>Business</b> type → add the <b>WhatsApp</b> product.
            </li>
            <li>
              In WhatsApp → <b>API Setup</b>: note the <b>Phone number ID</b>. Under “To”, add your own number and enter the code WhatsApp sends you.
            </li>
            <li>
              Make a token that never expires: Business settings → <b>System users</b> → Add (Admin) → Generate token for this app with{" "}
              <code className="font-mono text-[13px]">whatsapp_business_messaging</code> and <code className="font-mono text-[13px]">whatsapp_business_management</code>.
            </li>
            <li>
              Copy the <b>App secret</b> from App settings → Basic. Then run each line and paste when asked. Your number is digits only with country code, like
              14165551234.
              <Terminal
                lines={[
                  "pnpm secret WA_ACCESS_TOKEN",
                  "pnpm secret WA_PHONE_NUMBER_ID",
                  "pnpm secret WA_APP_SECRET",
                  "pnpm secret WA_USER_NUMBER",
                  "pnpm secret WA_VERIFY_TOKEN --random",
                  "pnpm ship",
                ]}
              />
            </li>
            <li>
              WhatsApp → <b>Configuration</b> → Webhook → Edit. Callback URL:
              <div className="mt-1.5">
                <Code>{`${s.appUrl}/api/whatsapp`}</Code>
              </div>
              Verify token: paste (the <code className="font-mono text-[13px]">--random</code> step copied it). Save, then subscribe to <b>messages</b>.
            </li>
            <li>
              Send <b>hi</b> to the test number from your WhatsApp. It replies with what it can do. Save the chat to your favourites.
            </li>
            <li className="text-muted">
              Optional, so the digest arrives even on days you haven&apos;t messaged: create a <b>Utility</b> template named <b>brain_digest</b> with body
              “Good morning. Your brain digest is ready: {"{{1}}"}. Reply to see it.” and a quick reply button “Show me”. Once approved, run{" "}
              <code className="font-mono text-[13px]">pnpm secret WA_TEMPLATE_NAME</code> and enter brain_digest.
            </li>
          </Ol>
        </div>
        <details className="rounded-2xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">Faster alternative: iPhone push with ntfy (5 minutes)</summary>
          <div className="mt-3">
            <Ol>
              <li>
                Run this. It makes a private topic name and copies it:
                <Terminal lines={["pnpm secret NTFY_TOPIC --random", "pnpm ship"]} />
              </li>
              <li>
                Install <b>ntfy</b> from the App Store, tap <b>+</b>, paste the topic. Exact-time reminders (“call mom at 5pm”) also arrive here.
              </li>
            </Ol>
          </div>
        </details>
      </div>
    ),
    semantic: (
      <Ol>
        <li>
          Sign up at{" "}
          <a href="https://console.supermemory.ai" target="_blank" rel="noreferrer" className="font-medium text-accent-ink underline decoration-accent/30 underline-offset-2">
            console.supermemory.ai
          </a>{" "}
          and create an API key.
          <Terminal lines={["pnpm secret SUPERMEMORY_API_KEY", "pnpm ship"]} />
        </li>
        <li>
          Let Claude search your brain. In Terminal:
          <Terminal lines={["claude mcp add --transport http --scope user supermemory https://mcp.supermemory.ai/mcp"]} />
          Then type <code className="font-mono text-[13px]">/mcp</code> in Claude Code and sign in with the same account.
        </li>
      </Ol>
    ),
  };

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <Link href="/" className="inline-flex items-center gap-1.5 py-3 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Brain
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Setup</h1>
      <p className="mt-1 text-[15px] text-muted">
        {s.done === s.total ? "Everything is connected." : `${s.done} of ${s.total} done. Do the highlighted one next.`}
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(s.done / s.total) * 100}%` }} />
      </div>

      {s.usingDevSecret && (
        <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Running with the local development key. Set <code className="font-mono">BRAIN_SECRET</code> before deploying.
        </p>
      )}

      <ol className="mt-6 space-y-3">
        {s.steps.map((step, i) => (
          <StepCard key={step.id} step={step} n={i + 1} open={step.id === nextStep}>
            {body[step.id]}
          </StepCard>
        ))}
      </ol>

      <section className="mt-10 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Extras</h2>
        <Extra title="Weekly email" on={s.features.email} lines={["pnpm secret RESEND_API_KEY", "pnpm secret DIGEST_EMAIL_TO", "pnpm ship"]}>
          Sunday recap by email: themes, everything you saved, and 3 random finds from the archive. Sign up at resend.com with the same email you want it
          sent to; no domain needed.
        </Extra>
        <Extra title="Todoist tasks in the digest" on={s.features.todoist} lines={["pnpm secret TODOIST_API_TOKEN", "pnpm ship"]}>
          Your token is in Todoist → Settings → Integrations → Developer. Read-only: tasks stay in Todoist.
        </Extra>
        <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">Your brain key</p>
            <p className="text-xs text-muted">Used by Shortcuts and for signing in on a new device.</p>
          </div>
          <CopyButton fetchKey label="Copy key" />
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-muted underline underline-offset-4 hover:text-ink">Sign out of this device</button>
        </form>
      </section>
      <p className="mt-8 text-xs text-faint">
        Digest runs daily around 8am ({s.tz}). Weekly email on Sundays. Server: {s.appUrl}
      </p>
    </main>
  );
}

function StepCard({ step, n, open, children }: { step: Step; n: number; open: boolean; children: React.ReactNode }) {
  return (
    <li>
      <details
        open={open}
        className={`group rounded-3xl border bg-card shadow-soft ${open ? "border-accent/40" : "border-line"}`}
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              step.done ? "bg-good-soft text-good" : open ? "bg-accent text-white" : "bg-canvas text-faint"
            }`}
          >
            {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-[15px] font-semibold ${step.done ? "text-muted" : "text-ink"}`}>{step.title}</p>
            <p className="truncate text-xs text-faint">{step.status}</p>
          </div>
          {!step.done && <span className="shrink-0 text-xs tabular-nums text-faint">~{step.minutes} min</span>}
        </summary>
        <div className="border-t border-line px-4 pb-5 pt-4">
          <p className="mb-4 text-sm text-muted">{step.why}</p>
          {children}
        </div>
      </details>
    </li>
  );
}

function Extra({ title, on, lines, children }: { title: string; on: boolean; lines: string[]; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-line bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium">{title}</span>
        <span className={`text-xs ${on ? "text-good" : "text-faint"}`}>{on ? "On" : "Off"}</span>
      </summary>
      <div className="space-y-2 border-t border-line px-4 pb-4 pt-3 text-sm text-muted">
        <p>{children}</p>
        <Terminal lines={lines} />
      </div>
    </details>
  );
}
