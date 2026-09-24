import { lastInbound } from "./channels/whatsapp";
import { lastDeliveries } from "./digest";
import { env, features } from "./env";
import { stats } from "./items";

export type StepId = "first" | "ai" | "iphone" | "browser" | "mac" | "digest" | "semantic";

export type Step = {
  id: StepId;
  title: string;
  why: string;
  minutes: number;
  done: boolean;
  status: string;
};

export async function setupStatus() {
  const [s, deliveries, waLast] = await Promise.all([
    stats(),
    lastDeliveries().catch(() => []),
    features.whatsapp ? lastInbound().catch(() => null) : Promise.resolve(null),
  ]);
  const last = s.lastBySource;
  const dailyAt = deliveries.find((d) => d.kind === "daily" || d.kind === "knock")?.last ?? null;
  const channel = features.whatsapp ? "WhatsApp" : features.ntfy ? "push" : features.email ? "email" : null;

  const steps: Step[] = [
    {
      id: "first",
      title: "Save your first thought",
      why: "Type anything on the home screen. That's the whole habit.",
      minutes: 1,
      done: s.total > 0,
      status: s.total ? `${s.total} saved, ${s.week} this week` : "Nothing saved yet",
    },
    {
      id: "ai",
      title: "Turn on AI filing",
      why: "Every capture gets a clear title, tags, and reminders pulled out of the text.",
      minutes: 3,
      done: features.llm && s.enriched > 0,
      status: features.llm ? `On · ${s.enriched} of ${s.total} filed` : "Needs an OpenRouter key",
    },
    {
      id: "iphone",
      title: "iPhone: share sheet, Action Button, Siri",
      why: "Save from any app in two taps, or say “Save to Brain”.",
      minutes: 5,
      done: !!(last.ios || last.shortcut),
      status: last.ios || last.shortcut ? "Working" : "Not used yet",
    },
    {
      id: "browser",
      title: "Browser: one-click save button",
      why: "Save the page you're on, with any highlighted text as a quote.",
      minutes: 1,
      done: !!last.browser,
      status: last.browser ? "Working" : "Not used yet",
    },
    {
      id: "mac",
      title: "Mac: global hotkey",
      why: "A keyboard shortcut that pops up a box from any app.",
      minutes: 2,
      done: !!last.mac,
      status: last.mac ? "Working" : "Not used yet",
    },
    {
      id: "digest",
      title: "Morning digest on WhatsApp",
      why: "Reminders, due tasks, and 3 things worth seeing again, every morning around 8.",
      minutes: 30,
      done: !!channel && !!dailyAt,
      status: channel
        ? `${channel} connected${dailyAt ? " · last digest sent" : " · waiting for the first digest"}${features.whatsapp && !waLast ? " · message the bot once to open the chat" : ""}`
        : "No delivery channel yet",
    },
    {
      id: "semantic",
      title: "Search by meaning, and ask Claude",
      why: "Find “that sleep article” even if the title never says sleep. Claude can search it too.",
      minutes: 5,
      done: features.supermemory && s.synced > 0,
      status: features.supermemory ? `On · ${s.synced} indexed` : "Needs a Supermemory key",
    },
  ];

  return {
    steps,
    done: steps.filter((x) => x.done).length,
    total: steps.length,
    features,
    appUrl: env.appUrl,
    tz: env.tz,
    models: { fast: env.modelFast, writer: env.modelWriter },
    waLast,
    deliveries,
    usingDevSecret: env.secret === "dev-secret",
  };
}
