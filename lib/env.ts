// Central config. Every integration is optional: the app works with only a
// database, and each feature switches on when its env vars are present.

const e = process.env;

function appUrl(): string {
  if (e.APP_URL) return e.APP_URL.replace(/\/$/, "");
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `http://localhost:${e.PORT || 3000}`;
}

export const env = {
  onVercel: !!e.VERCEL,
  appUrl: appUrl(),
  tz: e.LOCAL_TZ || "America/Toronto",

  secret: e.BRAIN_SECRET || (e.VERCEL ? "" : "dev-secret"),
  cronSecret: e.CRON_SECRET || "",
  databaseUrl: e.DATABASE_URL || e.POSTGRES_URL || "",

  openrouterKey: e.OPENROUTER_API_KEY || "",
  modelFast: e.LLM_MODEL_FAST || "anthropic/claude-opus-5",
  modelWriter: e.LLM_MODEL_WRITER || "anthropic/claude-opus-5",

  supermemoryKey: e.SUPERMEMORY_API_KEY || "",
  supermemoryTag: e.SUPERMEMORY_CONTAINER_TAG || "brain",

  wa: {
    token: e.WA_ACCESS_TOKEN || "",
    phoneNumberId: e.WA_PHONE_NUMBER_ID || "",
    verifyToken: e.WA_VERIFY_TOKEN || "",
    appSecret: e.WA_APP_SECRET || "",
    userNumber: (e.WA_USER_NUMBER || "").replace(/\D/g, ""),
    graphVersion: e.GRAPH_VERSION || "v23.0",
    graphBase: (e.GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, ""), // override only for local testing
    template: e.WA_TEMPLATE_NAME || "",
    templateLang: e.WA_TEMPLATE_LANG || "en",
  },

  resendKey: e.RESEND_API_KEY || "",
  emailTo: e.DIGEST_EMAIL_TO || "",
  emailFrom: e.DIGEST_EMAIL_FROM || "Brain <onboarding@resend.dev>",

  todoistToken: e.TODOIST_API_TOKEN || "",

  ntfyTopic: e.NTFY_TOPIC || "",
  ntfyServer: (e.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, ""),
};

export const features = {
  llm: !!env.openrouterKey,
  supermemory: !!env.supermemoryKey,
  whatsapp: !!(env.wa.token && env.wa.phoneNumberId && env.wa.userNumber),
  whatsappTemplate: !!(env.wa.token && env.wa.template),
  email: !!(env.resendKey && env.emailTo),
  todoist: !!env.todoistToken,
  ntfy: !!env.ntfyTopic,
};
